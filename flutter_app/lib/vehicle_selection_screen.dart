import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

enum VehicleType { taxi, tukTuk }

class VehicleSelectionScreen extends StatefulWidget {
  const VehicleSelectionScreen({super.key});
  @override
  State<VehicleSelectionScreen> createState() => _VehicleSelectionScreenState();
}

class _VehicleSelectionScreenState extends State<VehicleSelectionScreen> {
  VehicleType? selected;
  Position? position;
  String locationStatus = 'جاري تحديد موقعك...';
  bool locating = false;
  @override
  void initState() {
    super.initState();
    _locate();
  }

  Future<void> _locate() async {
    if (locating) return;
    setState(() { locating = true; locationStatus = 'جاري تحديد موقعك...'; });
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw Exception('فعّل خدمة الموقع GPS من إعدادات الجهاز');
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw Exception('مطلوب السماح بالوصول للموقع لبدء الرحلة');
      }
      final current = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      if (!mounted) return;
      setState(() {
        position = current;
        locationStatus = 'تم تحديد موقعك';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() { position = null; locationStatus = error.toString().replaceFirst('Exception: ', ''); });
    } finally {
      if (mounted) setState(() { locating = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    const yellow = Color(0xFFFFB900);
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: Colors.white,
        body: SafeArea(
          child: Column(
            children: [
              Container(
                height: 260,
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(24, 24, 24, 20),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft, end: Alignment.bottomRight,
                    colors: [Color(0xFF222222), Color(0xFF454545)],
                  ),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        IconButton(
                          tooltip: 'سجل الرحلات — قريبًا',
                          onPressed: () => _notice('سجل الرحلات قيد التطوير'),
                          icon: const Icon(Icons.history, color: yellow),
                        ),
                        IconButton(
                          tooltip: 'الإعدادات — قريبًا',
                          onPressed: () => _notice('الإعدادات قيد التطوير'),
                          icon: const Icon(Icons.settings_outlined, color: yellow),
                        ),
                      ],
                    ),
                    const Spacer(),
                    const Icon(Icons.speed, color: Colors.white, size: 72),
                    const Text('MeterGO', style: TextStyle(color: yellow, fontSize: 32, fontWeight: FontWeight.bold)),
                    const Spacer(),
                    InkWell(
                      onTap: _locate,
                      child: Row(
                        children: [
                          const Icon(Icons.location_on_outlined, color: yellow),
                          const SizedBox(width: 8),
                          Expanded(child: Text(locationStatus,
                            style: const TextStyle(color: yellow, fontSize: 17))),
                          if (locating) const SizedBox(width: 16, height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2, color: yellow)),
                        ],
                      ),
                    ),
                    const Divider(color: yellow, thickness: 3),
                  ],
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(22),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text('اختار وسيلة المواصلات',
                        style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 20),
                      Row(
                        children: [
                          Expanded(child: _vehicleCard(VehicleType.taxi, 'تاكسي', Icons.local_taxi)),
                          const SizedBox(width: 14),
                          Expanded(child: _vehicleCard(VehicleType.tukTuk, 'توك توك', Icons.electric_rickshaw)),
                        ],
                      ),
                      const Spacer(),
                      if (selected == null)
                        const Text('برجاء تحديد وسيلة المواصلات', textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.red)),
                      if (selected != null)
                        const Text('التعريفة الرسمية لم يتم اعتمادها بعد',
                          textAlign: TextAlign.center, style: TextStyle(color: Colors.deepOrange)),
                      const SizedBox(height: 20),
                      FilledButton(
                        onPressed: position != null && selected != null ? () =>
                          _notice('لا يمكن بدء رحلة بسعر غير موثق. سنضيف التعريفة الرسمية أولًا.') : null,
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF292929),
                          minimumSize: const Size.fromHeight(64),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                        ),
                        child: const Text('ابدأ الرحلة', style: TextStyle(fontSize: 25)),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _vehicleCard(VehicleType type, String title, IconData symbol) {
    final active = selected == type;
    return InkWell(
      onTap: () => setState(() => selected = type),
      borderRadius: BorderRadius.circular(20),
      child: Container(
        height: 190,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: active ? const Color(0xFFFFB900) : Colors.grey, width: active ? 3 : 1.5),
          color: active ? const Color(0xFFFFF9E6) : Colors.white,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(symbol, size: 70, color: const Color(0xFFFFB900)),
            const SizedBox(height: 12),
            Text(title, style: const TextStyle(fontSize: 23, fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            const Text('السعر الرسمي قيد التحقق', textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: Colors.grey)),
          ],
        ),
      ),
    );
  }

  void _notice(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }
}
