import 'package:http/http.dart' as http;

http.Client createRdClient({required bool allowSelfSigned}) => http.Client();
