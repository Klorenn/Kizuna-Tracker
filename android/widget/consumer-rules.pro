# Instantiated reflectively by the framework (manifest components); R8 must not strip or rename them.
-keep class com.kizunatracker.widget.KizunaWidgetProvider { <init>(); }
-keep class com.kizunatracker.widget.WidgetSetupActivity { <init>(); }
-keep class com.kizunatracker.widget.WidgetOpenActivity { <init>(); }
