import 'vehicle_selection_screen.dart';
import 'package:flutter/material.dart';

void main() => runApp(const MeterGoApp());

class MeterGoApp extends StatelessWidget {
  const MeterGoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MeterGO',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(useMaterial3: true),
      home: const SplashScreen(),
    );
  }
}

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    Future<void>.delayed(const Duration(seconds: 2), () {
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(builder: (_) => const VehicleSelectionScreen()),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Color(0xFF292929),
      body: SizedBox.expand(
        child: Image(
          image: AssetImage('assets/images/splash.png'),
          fit: BoxFit.cover,
        ),
      ),
    );
  }
}

// Temporary destination until the next Figma screen is implemented.
class VehicleSelectionPlaceholder extends StatelessWidget {
  const VehicleSelectionPlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: SafeArea(
        child: Center(
          child: Text('MeterGO — اختيار تاكسي أو توك توك', textDirection: TextDirection.rtl),
        ),
      ),
    );
  }
}
