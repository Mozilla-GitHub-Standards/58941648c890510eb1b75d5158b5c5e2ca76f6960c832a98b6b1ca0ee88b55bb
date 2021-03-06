function FindProxyForURL(url, host) {
  if ((url.substring(0, 5) != "http:" &&
       url.substring(0, 6) != "https:") ||
       isPlainHostName(host) ||
       shExpMatch(host, "*.local") ||
       isInNet(dnsResolve(host), "10.0.0.0", "255.0.0.0") ||
       isInNet(dnsResolve(host), "172.16.0.0", "255.240.0.0") ||
       isInNet(dnsResolve(host), "192.168.0.0", "255.255.0.0") ||
       isInNet(dnsResolve(host), "127.0.0.0", "255.255.255.0")) {
    return "DIRECT";
 }
  return "HTTPS <hostport>";
}
