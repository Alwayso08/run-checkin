package com.alwayso08.runcheckin;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ImageView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends AppCompatActivity {

    private static final String HOME_URL = "https://run-checkin.pages.dev";
    private static final String TAG = "RunCheckin";
    private static final int REQ_FILE_CHOOSER = 1001;
    private static final int REQ_CAMERA_PERM = 200;
    private static final long SPLASH_MIN_MS = 2500;
    private static final long SPLASH_MAX_MS = 5500;

    private WebView webView;
    private SwipeRefreshLayout swipeRefresh;
    private SplashRunView splashView;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long splashStart;
    private boolean splashHidden = false;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraOutputUri;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webview);
        swipeRefresh = findViewById(R.id.refresh);
        splashView = findViewById(R.id.splash);
        splashStart = SystemClock.elapsedRealtime();
        swipeRefresh.setOnRefreshListener(() -> webView.reload());

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA_PERM);
        }

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        CookieManager.getInstance().setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        }

        webView.addJavascriptInterface(new JsBridge(), "AndroidApp");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                long elapsed = SystemClock.elapsedRealtime() - splashStart;
                long delay = Math.max(0, SPLASH_MIN_MS - elapsed);
                handler.postDelayed(MainActivity.this::hideSplash, delay);
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                hideSplash();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl().toString());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                try {
                    launchChooser(params);
                    return true;
                } catch (Exception e) {
                    Log.e(TAG, "file chooser failed", e);
                    filePathCallback = null;
                    Toast.makeText(MainActivity.this, "无法打开相机/相册", Toast.LENGTH_SHORT).show();
                    return false;
                }
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                try {
                    DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                    req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "跑起来-" + System.currentTimeMillis());
                    DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    if (dm != null) dm.enqueue(req);
                    Toast.makeText(MainActivity.this, "开始下载", Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Log.e(TAG, "download failed", e);
                    Toast.makeText(MainActivity.this, "下载失败", Toast.LENGTH_SHORT).show();
                }
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    finish();
                }
            }
        });

        // 兜底：页面加载异常时最多 4.5 秒隐藏启动页
        handler.postDelayed(this::hideSplash, SPLASH_MAX_MS);

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
            hideSplash();
        } else {
            webView.loadUrl(HOME_URL);
        }
    }

    private void hideSplash() {
        if (splashHidden || splashView == null) return;
        splashHidden = true;
        splashView.stopAnimation();
        splashView.animate()
                .alpha(0f)
                .setDuration(450)
                .withEndAction(() -> splashView.setVisibility(View.GONE))
                .start();
    }

    private boolean isOurDomain(String url) {
        try {
            String host = Uri.parse(url).getHost();
            return host != null && (host.equals("run-checkin.pages.dev") || host.endsWith(".run-checkin.pages.dev"));
        } catch (Exception e) {
            return false;
        }
    }

    private boolean handleUrl(String url) {
        if (isOurDomain(url)) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (ActivityNotFoundException ignored) {
        }
        return true;
    }

    private void launchChooser(WebChromeClient.FileChooserParams params) {
        Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        File dir = new File(getExternalCacheDir(), "images");
        if (!dir.exists()) dir.mkdirs();
        File out = new File(dir, "capture_" + System.currentTimeMillis() + ".jpg");
        cameraOutputUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", out);
        camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraOutputUri);
        camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);

        Intent gallery = new Intent(Intent.ACTION_GET_CONTENT);
        gallery.addCategory(Intent.CATEGORY_OPENABLE);
        gallery.setType("image/*");

        boolean preferCamera = params != null && params.isCaptureEnabled();
        Intent chooser;
        if (preferCamera) {
            chooser = Intent.createChooser(camera, "拍照");
            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{gallery});
        } else {
            chooser = Intent.createChooser(gallery, "选择照片");
            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
        }
        startActivityForResult(chooser, REQ_FILE_CHOOSER);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE_CHOOSER) {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == RESULT_OK) {
                Uri picked = data != null ? data.getData() : null;
                if (picked != null) {
                    results = new Uri[]{picked};
                } else if (cameraOutputUri != null) {
                    results = new Uri[]{cameraOutputUri};
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
            cameraOutputUri = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    /** 网页 JS 桥：把导出文件（备份 zip / CSV）保存到手机下载目录 */
    private final class JsBridge {
        @JavascriptInterface
        public void saveBase64File(final String name, final String base64) {
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                String mime = name.endsWith(".zip") ? "application/zip" : (name.endsWith(".csv") ? "text/csv" : "application/octet-stream");
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    cv.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/跑起来");
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri != null) {
                        OutputStream os = getContentResolver().openOutputStream(uri);
                        if (os != null) {
                            os.write(data);
                            os.close();
                        }
                        notifySaved();
                        return;
                    }
                }
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "跑起来");
                if (!dir.exists()) dir.mkdirs();
                File f = new File(dir, name);
                FileOutputStream fos = new FileOutputStream(f);
                fos.write(data);
                fos.close();
                notifySaved();
            } catch (Exception e) {
                Log.e(TAG, "saveBase64File failed", e);
                final String msg = e.getMessage();
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "保存失败：" + msg, Toast.LENGTH_LONG).show());
            }
        }

        private void notifySaved() {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, "已保存到「下载/跑起来」目录", Toast.LENGTH_LONG).show());
        }
    }
}
