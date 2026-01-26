data class Lesson(
    val id: String,
    val title: String,
    val level: Int,
    val items: List<Item>
)

data class Item(
    val type: ItemType,
    val q: String,
    val a: String,
    val extra: String? = null
)

enum class ItemType {
    WORD, GRAMMAR, MCQ, FILL, LISTEN
}
