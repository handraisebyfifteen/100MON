package com.hyakumon

import android.media.AudioAttributes
import android.media.SoundPool
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray

/**
 * 効果音を鳴らす部品。JS 側の呼び出し口は fos/src/specs/NativeSfx.ts。
 * Android の SoundPool（短い音を低遅延で重ねて鳴らすための仕組み）に、res/raw の wav を読み込んでおく。
 * 音の名前（例 newBest）は、Android の資源名の決まりに合わせて小文字（newbest.wav）で探す。
 */
class SfxModule(context: ReactApplicationContext) : NativeSfxSpec(context) {
  private val pool: SoundPool =
      SoundPool.Builder()
          .setMaxStreams(MAX_STREAMS)
          .setAudioAttributes(
              AudioAttributes.Builder()
                  .setUsage(AudioAttributes.USAGE_GAME)
                  .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                  .build())
          .build()

  /** 音の名前 → SoundPool の id */
  private val ids = HashMap<String, Int>()

  /** 読み込みが済んだ id */
  private val loaded = HashSet<Int>()

  override fun load(names: ReadableArray, promise: Promise) {
    val context = reactApplicationContext
    val resIds = ArrayList<Pair<String, Int>>()
    for (i in 0 until names.size()) {
      val name = names.getString(i) ?: continue
      val resId = context.resources.getIdentifier(name.lowercase(), "raw", context.packageName)
      if (resId != 0) resIds.add(name to resId)
    }
    if (resIds.isEmpty()) {
      promise.resolve(0.0)
      return
    }
    // 読み込みは別スレッドで進むので、始める前に「終わった」の受け口を用意しておく
    var remaining = resIds.size
    var resolved = false
    pool.setOnLoadCompleteListener { _, sampleId, status ->
      synchronized(this) {
        if (status == 0) loaded.add(sampleId)
        remaining -= 1
        if (remaining == 0 && !resolved) {
          resolved = true
          promise.resolve(loaded.size.toDouble())
        }
      }
    }
    for ((name, resId) in resIds) {
      ids[name] = pool.load(context, resId, 1)
    }
  }

  override fun play(name: String, volume: Double) {
    val id = ids[name] ?: return
    if (!loaded.contains(id)) return
    val v = volume.toFloat().coerceIn(0f, 1f)
    pool.play(id, v, v, 1, 0, 1f)
  }

  override fun invalidate() {
    pool.release()
    super.invalidate()
  }

  companion object {
    /** 同時に鳴らせる数。Vega 版の MAX_VOICES と同じ */
    private const val MAX_STREAMS = 8
  }
}
