import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';

http.Client createRdClient({required bool allowSelfSigned}) {
  final httpClient = HttpClient();
  if (allowSelfSigned) {
    httpClient.badCertificateCallback = (certificate, host, port) => true;
  }
  return IOClient(httpClient);
}
