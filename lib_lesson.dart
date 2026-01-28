
Future<List<Lesson>> loadAllLessons() async {
  final lessons = <Lesson>[];
  final manifest = await DefaultAssetBundle.of(context).loadString('AssetManifest.json');
  final Map<String, dynamic> manifestMap = json.decode(manifest);
  
  // پیدا کردن همه فایل‌های JSON درس‌ها
  final lessonFiles = manifestMap.keys
      .where((path) => path.startsWith('assets/lessons/') && path.endsWith('.json'))
      .toList()
      ..sort(); // مرتب سازی خودکار
  
  for (final path in lessonFiles) {
    try {
      final data = await rootBundle.loadString(path);
      final lesson = Lesson.fromJson(json.decode(data));
      lessons.add(lesson);
    } catch (e) {
      print('خطا در بارگذاری درس از $path: $e');
    }
  }
  
  return lessons;
}
