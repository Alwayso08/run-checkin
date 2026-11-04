plugins {
    id("com.android.application")
}

android {
    namespace = "com.alwayso08.runcheckin"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.alwayso08.runcheckin"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "2.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.core:core:1.13.1")
}
