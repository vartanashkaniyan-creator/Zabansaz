
object Gam {

    fun xpFor(level: Int): Int {
        return level * 10
    }

    fun badge(progress: Int): String {
        return when {
            progress >= 100 -> "Gold"
            progress >= 50 -> "Silver"
            else -> "Bronze"
        }
    }
}
