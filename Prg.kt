object Prg {

    private val map = mutableMapOf<String, Int>()

    fun load(ctx: Context) {
        val sp = ctx.getSharedPreferences("prg", Context.MODE_PRIVATE)
        sp.all.forEach {
            map[it.key] = it.value as Int
        }
    }

    fun get(lang: String): Int {
        return map[lang] ?: 0
    }

    fun inc(ctx: Context, lang: String) {
        map[lang] = get(lang) + 1
        ctx.getSharedPreferences("prg", Context.MODE_PRIVATE)
            .edit()
            .putInt(lang, map[lang]!!)
            .apply()
    }
}
