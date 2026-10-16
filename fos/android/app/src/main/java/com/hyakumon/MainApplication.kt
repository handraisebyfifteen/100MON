package com.hyakumon

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.config.ReactFeatureFlags
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // 効果音（SoundPool）。このアプリの中にある部品なので手で登録する
          add(SfxPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // react-native-tvos の Android 側は、標準ではリモコンのキーを「離したとき」しか JS に渡さない。
    // 速読クイズは押した瞬間に反応したいので、「押したとき」も渡すようにする（fos/src/platform/input.ts が 0=押した を使う）
    ReactFeatureFlags.enableKeyDownEvents = true
    loadReactNative(this)
  }
}
