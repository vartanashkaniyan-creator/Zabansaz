import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lang_master/core/app_config.dart';
import 'package:lang_master/data/auth_service.dart';
import 'package:lang_master/data/lang_manager.dart';
import 'package:lang_master/data/sync_service.dart';
import 'package:lang_master/ui/widgets/progress_bar.dart';
import 'package:lang_master/ui/widgets/custom_bar.dart';
import 'package:lang_master/ui/widgets/lesson_card.dart';

/// 🏠 **Enterprise Home Page**
/// صفحه اصلی با دیشبورد هوشمند و شخصی‌سازی شده
class HomePage extends StatefulWidget {
  const HomePage({Key? key}) : super(key: key);

  @override
  _HomePageState createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> with SingleTickerProviderStateMixin {
  // Animation
  late AnimationController _animationController;
  late Animation<double> _fadeAnimation;
  
  // State
  int _selectedTab = 0;
  bool _isLoading = true;
  List<Lesson> _recommendedLessons = [];
  Map<String, dynamic> _userStats = {};
  String _dailyQuote = '';
  
  // Services
  late AuthService _authService;
  late LanguageManager _langManager;
  late SyncService _syncService;
  
  // ==================== [LIFECYCLE] ====================
  
  @override
  void initState() {
    super.initState();
    
    _initAnimations();
    _loadInitialData();
    _setupListeners();
  }
  
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    
    _authService = Provider.of<AuthService>(context, listen: false);
    _langManager = Provider.of<LanguageManager>(context, listen: false);
    _syncService = Provider.of<SyncService>(context, listen: false);
  }
  
  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }
  
  // ==================== [ANIMATIONS] ====================
  
  void _initAnimations() {
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 800),
      vsync: this,
    );
    
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _animationController,
        curve: Curves.easeInOut,
      ),
    );
    
    _animationController.forward();
  }
  
  // ==================== [DATA LOADING] ====================
  
  Future<void> _loadInitialData() async {
    setState(() => _isLoading = true);
    
    try {
      await Future.wait([
        _loadUserStats(),
        _loadRecommendedLessons(),
        _loadDailyQuote(),
        _syncService.syncAll(),
      ]);
    } catch (e) {
      print('Home page data loading error: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }
  
  Future<void> _loadUserStats() async {
    // TODO: Load from database or API
    await Future.delayed(Duration(milliseconds: 300));
    
    _userStats = {
      'streak_days': 7,
      'total_xp': 1250,
      'level': 3,
      'level_progress': 65,
      'lessons_completed': 24,
      'words_learned': 150,
      'time_spent': 1250, // minutes
      'accuracy': 87,
    };
  }
  
  Future<void> _loadRecommendedLessons() async {
    // TODO: Load based on user progress and AI recommendations
    await Future.delayed(Duration(milliseconds: 400));
    
    _recommendedLessons = List.generate(3, (index) => Lesson(
      id: 'rec_$index',
      title: _langManager.translate('lesson_${index + 1}_title'),
      description: _langManager.translate('lesson_${index + 1}_desc'),
      difficulty: ['beginner', 'intermediate', 'advanced'][index],
      estimatedTime: 15,
      isCompleted: index == 0,
      languageCode: _langManager.currentLanguageConfig?.code ?? 'en',
    ));
  }
  
  Future<void> _loadDailyQuote() async {
    // TODO: Load from API or local database
    await Future.delayed(Duration(milliseconds: 200));
    
    _dailyQuote = _langManager.translate('daily_quote',
      defaultValue: 'The limits of my language mean the limits of my world.',
    );
  }
  
  // ==================== [LISTENERS] ====================
  
  void _setupListeners() {
    // Listen for language changes
    _langManager.addListener(_onLanguageChanged);
    
    // Listen for auth state changes
    _authService.addAuthListener(_onAuthStateChanged);
    
    // Listen for sync events
    _syncService.addSyncListener(_onSyncEvent);
  }
  
  void _onLanguageChanged() {
    // Reload data with new language
    unawaited(_loadRecommendedLessons());
    unawaited(_loadDailyQuote());
    setState(() {});
  }
  
  void _onAuthStateChanged(AuthState state) {
    if (state == AuthState.unauthenticated) {
      // Handle logout
    } else if (state == AuthState.authenticated) {
      // Reload user-specific data
      unawaited(_loadInitialData());
    }
  }
  
  void _onSyncEvent(SyncEvent event) {
    if (event == SyncEvent.completed) {
      // Refresh data after sync
      unawaited(_loadUserStats());
    }
  }
  
  // ==================== [UI BUILDING] ====================
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.background,
      body: _isLoading
          ? _buildLoadingScreen()
          : _buildMainContent(),
      bottomNavigationBar: _buildBottomNavBar(),
    );
  }
  
  Widget _buildLoadingScreen() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 20),
          Text(
            _langManager.translate('loading_home'),
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ],
      ),
    );
  }
  
  Widget _buildMainContent() {
    return SafeArea(
      child: FadeTransition(
        opacity: _fadeAnimation,
        child: CustomScrollView(
          slivers: [
            // App Bar
            _buildAppBar(),
            
            // Main Content
            SliverList(
              delegate: SliverChildListDelegate([
                // Welcome Section
                _buildWelcomeSection(),
                
                // Daily Quote
                _buildDailyQuoteSection(),
                
                // Statistics
                _buildStatsSection(),
                
                // Recommended Lessons
                _buildLessonsSection(),
                
                // Quick Actions
                _buildQuickActions(),
                
                // Language Progress
                _buildLanguageProgress(),
                
                // Community Activity
                _buildCommunitySection(),
                
                SizedBox(height: 100), // Bottom padding
              ]),
            ),
          ],
        ),
      ),
    );
  }
  
  // ==================== [SECTIONS] ====================
  
  SliverAppBar _buildAppBar() {
    return SliverAppBar(
      floating: true,
      snap: true,
      elevation: 0,
      backgroundColor: Colors.transparent,
      leading: _buildProfileButton(),
      title: Text(
        _langManager.translate('app_name'),
        style: TextStyle(
          fontWeight: FontWeight.bold,
          fontSize: 24,
          color: Theme.of(context).colorScheme.primary,
        ),
      ),
      centerTitle: true,
      actions: [
        _buildSyncButton(),
        _buildNotificationsButton(),
        SizedBox(width: 8),
      ],
    );
  }
  
  Widget _buildProfileButton() {
    return IconButton(
      icon: CircleAvatar(
        radius: 16,
        backgroundImage: _authService.currentUser?.avatarUrl != null
            ? NetworkImage(_authService.currentUser!.avatarUrl!)
            : null,
        child: _authService.currentUser?.avatarUrl == null
            ? Icon(Icons.person, size: 18)
            : null,
      ),
      onPressed: _navigateToProfile,
    );
  }
  
  Widget _buildSyncButton() {
    return IconButton(
      icon: Stack(
        children: [
          Icon(Icons.sync),
          if (_syncService.isSyncing)
            Positioned(
              right: 0,
              top: 0,
              child: Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: Colors.orange,
                  shape: BoxShape.circle,
                ),
              ),
            ),
        ],
      ),
      onPressed: _syncService.isSyncing ? null : _onSyncPressed,
      tooltip: _langManager.translate('sync'),
    );
  }
  
  Widget _buildNotificationsButton() {
    return IconButton(
      icon: Stack(
        children: [
          Icon(Icons.notifications),
          // Badge for unread notifications
          Positioned(
            right: 0,
            top: 0,
            child: Container(
              padding: EdgeInsets.all(2),
              decoration: BoxDecoration(
                color: Colors.red,
                shape: BoxShape.circle,
              ),
              constraints: BoxConstraints(
                minWidth: 16,
                minHeight: 16,
              ),
              child: Text(
                '3',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ],
      ),
      onPressed: _navigateToNotifications,
    );
  }
  
  Widget _buildWelcomeSection() {
    return Container(
      padding: EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _getGreeting(),
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          SizedBox(height: 4),
          Text(
            _authService.isGuest
                ? _langManager.translate('welcome_guest')
                : _langManager.translate('welcome_back'),
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: Colors.grey[600],
            ),
          ),
          SizedBox(height: 8),
          if (_authService.isGuest)
            ElevatedButton(
              onPressed: _navigateToLogin,
              child: Text(_langManager.translate('login_to_save_progress')),
              style: ElevatedButton.styleFrom(
                minimumSize: Size(double.infinity, 48),
              ),
            ),
        ],
      ),
    );
  }
  
  String _getGreeting() {
    final hour = DateTime.now().hour;
    
    if (hour < 12) {
      return _langManager.translate('good_morning');
    } else if (hour < 17) {
      return _langManager.translate('good_afternoon');
    } else {
      return _langManager.translate('good_evening');
    }
  }
  
  Widget _buildDailyQuoteSection() {
    return Container(
      margin: EdgeInsets.symmetric(horizontal: 20, vertical: 10),
      padding: EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.primary.withOpacity(0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: Theme.of(context).colorScheme.primary.withOpacity(0.2),
        ),
      ),
      child: Column(
        children: [
          Icon(
            Icons.format_quote,
            size: 32,
            color: Theme.of(context).colorScheme.primary,
          ),
          SizedBox(height: 12),
          Text(
            _dailyQuote,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 16,
              fontStyle: FontStyle.italic,
              color: Colors.grey[700],
            ),
          ),
          SizedBox(height: 8),
          Text(
            _langManager.translate('daily_quote_author',
              defaultValue: '- Ludwig Wittgenstein',
            ),
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey[500],
            ),
          ),
        ],
      ),
    );
  }
  
  Widget _buildStatsSection() {
    return Container(
      padding: EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _langManager.translate('your_stats'),
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          SizedBox(height: 16),
          GridView.count(
            shrinkWrap: true,
            physics: NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            childAspectRatio: 1.5,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            children: [
              _buildStatCard(
                icon: Icons.local_fire_department,
                title: _langManager.translate('streak'),
                value: '${_userStats['streak_days']} ${_langManager.translate('days')}',
                color: Colors.orange,
              ),
              _buildStatCard(
                icon: Icons.auto_awesome,
                title: _langManager.translate('level'),
                value: '${_userStats['level']}',
                color: Colors.blue,
                progress: _userStats['level_progress'] / 100,
              ),
              _buildStatCard(
                icon: Icons.check_circle,
                title: _langManager.translate('lessons_completed'),
                value: '${_userStats['lessons_completed']}',
                color: Colors.green,
              ),
              _buildStatCard(
                icon: Icons.timer,
                title: _langManager.translate('time_spent'),
                value: '${_userStats['time_spent']} ${_langManager.translate('min')}',
                color: Colors.purple,
              ),
            ],
          ),
        ],
      ),
    );
  }
  
  Widget _buildStatCard({
    required IconData icon,
    required String title,
    required String value,
    required Color color,
    double? progress,
  }) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                Container(
                  padding: EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(icon, color: color, size: 20),
                ),
                Spacer(),
                if (progress != null)
                  Text(
                    '${(progress * 100).toInt()}%',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
              ],
            ),
            SizedBox(height: 8),
            Text(
              title,
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey[600],
              ),
            ),
            Text(
              value,
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.grey[800],
              ),
            ),
            if (progress != null)
              SizedBox(
                height: 4,
                child: LinearProgressIndicator(
                  value: progress,
                  backgroundColor: color.withOpacity(0.1),
                  valueColor: AlwaysStoppedAnimation<Color>(color),
                ),
              ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildLessonsSection() {
    return Container(
      padding: EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                _langManager.translate('recommended_for_you'),
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              TextButton(
                onPressed: _navigateToAllLessons,
                child: Text(_langManager.translate('see_all')),
              ),
            ],
          ),
          SizedBox(height: 12),
          SizedBox(
            height: 220,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              itemCount: _recommendedLessons.length,
              itemBuilder: (context, index) {
                final lesson = _recommendedLessons[index];
                return Container(
                  width: 280,
                  margin: EdgeInsets.only(
                    right: index < _recommendedLessons.length - 1 ? 16 : 0,
                  ),
                  child: LessonCard(
                    lesson: lesson,
                    onTap: () => _onLessonTap(lesson),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
  
  Widget _buildQuickActions() {
    final actions = [
      {
        'icon': Icons.play_lesson,
        'title': _langManager.translate('continue_learning'),
        'color': Colors.blue,
        'onTap': _continueLearning,
      },
      {
        'icon': Icons.quiz,
        'title': _langManager.translate('take_quiz'),
        'color': Colors.green,
        'onTap': _takeQuiz,
      },
      {
        'icon': Icons.volume_up,
        'title': _langManager.translate('practice_speaking'),
        'color': Colors.orange,
        'onTap': _practiceSpeaking,
      },
      {
        'icon': Icons.library_books,
        'title': _langManager.translate('vocabulary_review'),
        'color': Colors.purple,
        'onTap': _reviewVocabulary,
      },
    ];
    
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 20, vertical: 10),
      child: GridView.count(
        shrinkWrap: true,
        physics: NeverScrollableScrollPhysics(),
        crossAxisCount: 2,
        childAspectRatio: 2.5,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        children: actions.map((action) {
          return Card(
            elevation: 2,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: action['onTap'] as void Function()?,
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Row(
                  children: [
                    Container(
                      padding: EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: (action['color'] as Color).withOpacity(0.1),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        action['icon'] as IconData,
                        color: action['color'] as Color,
                        size: 20,
                      ),
                    ),
                    SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        action['title'] as String,
                        style: TextStyle(
                          fontWeight: FontWeight.w500,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
  
  Widget _buildLanguageProgress() {
    // TODO: Load actual language progress
    return Container(
      padding: EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _langManager.translate('language_progress'),
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          SizedBox(height: 16),
          Card(
            elevation: 2,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Column(
                children: [
                  ListTile(
                    leading: CircleAvatar(
                      child: Text('EN'),
                    ),
                    title: Text('English'),
                    subtitle: ProgressBar(
                      progress: 0.75,
                      height: 6,
                    ),
                    trailing: Text('75%'),
                  ),
                  Divider(),
                  ListTile(
                    leading: CircleAvatar(
                      child: Text('FA'),
                    ),
                    title: Text('فارسی'),
                    subtitle: ProgressBar(
                      progress: 0.45,
                      height: 6,
                    ),
                    trailing: Text('45%'),
                  ),
                  Divider(),
                  ListTile(
                    leading: CircleAvatar(
                      child: Text('DE'),
                    ),
                    title: Text('Deutsch'),
                    subtitle: ProgressBar(
                      progress: 0.20,
                      height: 6,
                    ),
                    trailing: Text('20%'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
  
  Widget _buildCommunitySection() {
    // TODO: Implement community features
    return Container(
      padding: EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _langManager.translate('community'),
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          SizedBox(height: 12),
          Text(
            _langManager.translate('community_description'),
            style: TextStyle(color: Colors.grey[600]),
          ),
        ],
      ),
    );
  }
  
  Widget _buildBottomNavBar() {
    return CustomNavigationBar(
      currentIndex: _selectedTab,
      onTap: (index) => setState(() => _selectedTab = index),
      items: [
        BottomNavigationBarItem(
          icon: Icon(Icons.home),
          label: _langManager.translate('home'),
        ),
        BottomNavigationBarItem(
          icon: Icon(Icons.school),
          label: _langManager.translate('learn'),
        ),
        BottomNavigationBarItem(
          icon: Icon(Icons.bar_chart),
          label: _langManager.translate('progress'),
        ),
        BottomNavigationBarItem(
          icon: Icon(Icons.person),
          label: _langManager.translate('profile'),
        ),
      ],
    );
  }
  
  // ==================== [NAVIGATION] ====================
  
  void _onSyncPressed() {
    _syncService.forceSync();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(_langManager.translate('syncing'))),
    );
  }
  
  void _navigateToProfile() {
    Navigator.pushNamed(context, '/profile');
  }
  
  void _navigateToNotifications() {
    Navigator.pushNamed(context, '/notifications');
  }
  
  void _navigateToLogin() {
    Navigator.pushNamed(context, '/login');
  }
  
  void _navigateToAllLessons() {
    Navigator.pushNamed(context, '/lessons');
  }
  
  void _onLessonTap(Lesson lesson) {
    Navigator.pushNamed(
      context,
      '/lesson',
      arguments: {'lessonId': lesson.id},
    );
  }
  
  void _continueLearning() {
    // TODO: Navigate to last lesson or recommended lesson
  }
  
  void _takeQuiz() {
    Navigator.pushNamed(context, '/quiz');
  }
  
  void _practiceSpeaking() {
    Navigator.pushNamed(context, '/speaking');
  }
  
  void _reviewVocabulary() {
    Navigator.pushNamed(context, '/vocabulary');
  }
}

// Supporting classes (should be in separate files)
class Lesson {
  final String id;
  final String title;
  final String description;
  final String difficulty;
  final int estimatedTime;
  final bool isCompleted;
  final String languageCode;
  
  Lesson({
    required this.id,
    required this.title,
    required this.description,
    required this.difficulty,
    required this.estimatedTime,
    required this.isCompleted,
    required this.languageCode,
  });
}

void unawaited(Future<void> future) {
  future.then((_) {}).catchError((_) {});
}
