
object Usr {

    var id: String? = null
    var email: String? = null
    var loggedIn = false

    fun load(ctx: Context) {
        val sp = ctx.getSharedPreferences("usr", Context.MODE_PRIVATE)
        id = sp.getString("id", null)
        email = sp.getString("email", null)
        loggedIn = id != null
    }

    fun save(ctx: Context) {
        ctx.getSharedPreferences("usr", Context.MODE_PRIVATE)
            .edit()
            .putString("id", id)
            .putString("email", email)
            .apply()
    }

    fun logout(ctx: Context) {
        ctx.getSharedPreferences("usr", Context.MODE_PRIVATE).edit().clear().apply()
        loggedIn = false
    }
}
