package com.ucs.scrapper

import org.json.JSONArray
import org.json.JSONObject

class TrainedStep {
    var type = "click"
    var text = ""
    var desc = ""
    var cls = ""
    var relX = 0f
    var relY = 0f

    fun toJson(): JSONObject {
        val o = JSONObject()
        o.put("type", type)
        o.put("text", text)
        o.put("desc", desc)
        o.put("cls", cls)
        o.put("relX", relX.toDouble())
        o.put("relY", relY.toDouble())
        return o
    }

    companion object {
        fun fromJson(o: JSONObject): TrainedStep {
            val s = TrainedStep()
            s.type = o.optString("type", "click")
            s.text = o.optString("text", "")
            s.desc = o.optString("desc", "")
            s.cls = o.optString("cls", "")
            s.relX = o.optDouble("relX", 0.0).toFloat()
            s.relY = o.optDouble("relY", 0.0).toFloat()
            return s
        }

        fun save(steps: List<TrainedStep>): String {
            val a = JSONArray()
            steps.forEach { a.put(it.toJson()) }
            return a.toString()
        }

        fun load(json: String?): List<TrainedStep> {
            if (json.isNullOrBlank()) return emptyList()
            val out = mutableListOf<TrainedStep>()
            try {
                val a = JSONArray(json)
                for (i in 0 until a.length()) out.add(fromJson(a.getJSONObject(i)))
            } catch (t: Throwable) {}
            return out
        }
    }
}