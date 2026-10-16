package com.hyakumon

import android.view.ViewGroup
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * リモコンのキーが JS に届くように、React の根元の View にフォーカスを持たせる。
   * Android はキー入力を「フォーカスを持つ View」の系統にしか配らない。このアプリはフォーカスできる部品を
   * 一つも置かない作り（Vega 版と同じ）なので、何もしないとキーが根元（react-native-tvos がキーを JS に渡す場所）
   * まで降りてこない。画面を得るたびに確かめる（ホームやスクリーンセーバーから戻ったときも含む）。
   */
  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) focusReactRoot()
  }

  private fun focusReactRoot() {
    val content = findViewById<ViewGroup>(android.R.id.content) ?: return
    val root = content.getChildAt(0) ?: return
    root.isFocusable = true
    root.isFocusableInTouchMode = true
    if (!root.hasFocus()) root.requestFocus()
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "hyakumon"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
