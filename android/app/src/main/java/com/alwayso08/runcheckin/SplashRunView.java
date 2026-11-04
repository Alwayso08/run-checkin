package com.alwayso08.runcheckin;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.AttributeSet;
import android.view.View;

/**
 * 启动页视图：微信风格地球背景 + 奔跑人物逐帧动画
 * - 人物边跑边向右缓慢移动（不是原地踏步）
 * - 步频放慢（130ms/帧）
 */
public class SplashRunView extends View {

    // 背景基准尺寸
    private static final float BG_W = 1080f;
    private static final float BG_H = 2340f;
    // 人物精灵在背景图坐标系中的位置（与生成脚本一致）
    private static final float SPRITE_X = 377f;
    private static final float SPRITE_Y = 1430f;
    private static final float SPRITE_W = 195f;
    private static final float SPRITE_H = 209f;

    // 步频：130ms/帧（放慢）
    private static final long FRAME_MS = 130;
    // 水平移动速度：图像坐标下每秒 95px（慢跑速度，2.5 秒约移动 240px）
    private static final float SPEED_PX_PER_SEC = 95f;

    private static final int[] FRAME_IDS = {
        R.drawable.run_0, R.drawable.run_1, R.drawable.run_2, R.drawable.run_3,
        R.drawable.run_4, R.drawable.run_5, R.drawable.run_6, R.drawable.run_7,
        R.drawable.run_8, R.drawable.run_9, R.drawable.run_10, R.drawable.run_11
    };

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final RectF bgDst = new RectF();
    private final RectF spriteDst = new RectF();

    private Bitmap bg;
    private Bitmap[] frames;
    private int frameIndex = 0;
    private boolean animating = false;
    private long startTime = 0;

    public SplashRunView(Context context) {
        super(context);
        init();
    }

    public SplashRunView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    public SplashRunView(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
        init();
    }

    private void init() {
        if (isInEditMode()) return;
        bg = BitmapFactory.decodeResource(getResources(), R.drawable.splash_bg);
        frames = new Bitmap[FRAME_IDS.length];
        for (int i = 0; i < FRAME_IDS.length; i++) {
            frames[i] = BitmapFactory.decodeResource(getResources(), FRAME_IDS[i]);
        }
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        startAnimation();
    }

    @Override
    protected void onDetachedFromWindow() {
        stopAnimation();
        super.onDetachedFromWindow();
    }

    public void startAnimation() {
        if (animating || frames == null || frames.length == 0) return;
        animating = true;
        startTime = SystemClock.elapsedRealtime();
        frameIndex = 0;
        handler.post(tick);
    }

    public void stopAnimation() {
        animating = false;
        handler.removeCallbacks(tick);
    }

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (!animating) return;
            frameIndex = (frameIndex + 1) % frames.length;
            invalidate();
            handler.postDelayed(this, FRAME_MS);
        }
    };

    @Override
    protected void onDraw(Canvas canvas) {
        if (bg == null || frames == null) {
            canvas.drawColor(0xFF0A0F0D);
            return;
        }
        float scale = Math.max(getWidth() / BG_W, getHeight() / BG_H);
        float dx = (getWidth() - BG_W * scale) / 2f;
        float dy = (getHeight() - BG_H * scale) / 2f;

        bgDst.set(dx, dy, dx + BG_W * scale, dy + BG_H * scale);
        canvas.drawBitmap(bg, null, bgDst, paint);

        // 水平移动距离（图像坐标系）
        long elapsed = SystemClock.elapsedRealtime() - startTime;
        float movePx = SPEED_PX_PER_SEC * (elapsed / 1000f);
        // 不超出画面右侧
        float maxMove = BG_W - SPRITE_X - SPRITE_W - 20f;
        movePx = Math.min(movePx, Math.max(0f, maxMove));

        Bitmap frame = frames[frameIndex % frames.length];
        if (frame != null) {
            float sx = SPRITE_X + movePx;
            spriteDst.set(
                dx + sx * scale,
                dy + SPRITE_Y * scale,
                dx + (sx + SPRITE_W) * scale,
                dy + (SPRITE_Y + SPRITE_H) * scale
            );
            canvas.drawBitmap(frame, null, spriteDst, paint);
        }
    }
}
