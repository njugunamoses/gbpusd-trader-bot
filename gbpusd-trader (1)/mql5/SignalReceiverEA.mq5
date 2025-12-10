//+------------------------------------------------------------------+
//| SignalReceiverEA.mq5                                             |
//| Demo EA: polls backend for pending orders and executes them      |
//+------------------------------------------------------------------+
#property version "1.00"

input string ServerURL = "https://localhost"; // change to your public https URL in production
input string ApiKey = "REPLACE_WITH_API_KEY";
input int    PollSeconds = 10;

datetime lastPoll = 0;

// NOTE: This EA still uses naive JSON parsing. ODO: Replace parsing with Json.mqh and robust validation before live use.

string http_get(string url)
{
  char result[];
  int timeout = 10000;
  int res = WebRequest("GET", url, "", NULL, 0, result, timeout);
  if(res == -1)
  {
    Print("WebRequest failed. Error: ", GetLastError());
    return "";
  }
  return CharArrayToString(result);
}

void OnTick()
{
  datetime now = TimeCurrent();
  if((int)(now - lastPoll) < PollSeconds) return;
  lastPoll = now;

  string url = ServerURL + "/api/get-orders?key=" + ApiKey;
  string json = http_get(url);
  if(StringLen(json) == 0) return;

  if(StringFind(json, ""orders"") < 0) return;

  int pos = 0;
  while(true)
  {
    int start = StringFind(json, "{", pos);
    if(start < 0) break;
    int end = StringFind(json, "}", start);
    if(end < 0) break;
    string obj = StringSubstr(json, start, end-start+1);
    pos = end+1;
    string id_str = ParseJsonField(obj, "id");
    if(StringLen(id_str) == 0) continue;
    string symbol = ParseJsonField(obj, "symbol");
    string side = ParseJsonField(obj, "side");
    string size_s = ParseJsonField(obj, "size");
    double size = (size_s=="")? 0.01 : StrToDouble(size_s);

    if(StringCompare(side, "buy") == 0)
    {
      double price = SymbolInfoDouble(symbol, SYMBOL_ASK);
      int ticket = OrderSend(symbol, OP_BUY, size, price, 10, 0, 0, "auto", 0, 0, clrNONE);
      Print("Attempted buy: ", symbol, " ticket=", ticket);
    }
    else if(StringCompare(side, "sell") == 0)
    {
      double price = SymbolInfoDouble(symbol, SYMBOL_BID);
      int ticket = OrderSend(symbol, OP_SELL, size, price, 10, 0, 0, "auto", 0, 0, clrNONE);
      Print("Attempted sell: ", symbol, " ticket=", ticket);
    }
  }
}

string ParseJsonField(string obj, string field)
{
  string key = '"' + field + '"';
  int p = StringFind(obj, key);
  if(p<0) return "";
  int colon = StringFind(obj, ":", p);
  if(colon<0) return "";
  int comma = StringFind(obj, ",", colon);
  int endpos = (comma<0) ? StringFind(obj, "}", colon) : comma;
  if(endpos<0) endpos = StringLen(obj)-1;
  string val = StringSubstr(obj, colon+1, endpos-colon-1);
  val = StringTrim(val);
  if(StringGetCharacter(val,0) == '"') val = StringSubstr(val,1,StringLen(val)-2);
  return val;
}

string StringTrim(string s)
{
  int i1 = 0;
  while(i1<StringLen(s) && (StringGetCharacter(s,i1)==32 || StringGetCharacter(s,i1)==9 || StringGetCharacter(s,i1)==10 || StringGetCharacter(s,i1)==13)) i1++;
  int i2 = StringLen(s)-1;
  while(i2>=0 && (StringGetCharacter(s,i2)==32 || StringGetCharacter(s,i2)==9 || StringGetCharacter(s,i2)==10 || StringGetCharacter(s,i2)==13)) i2--;
  if(i2 < i1) return "";
  return StringSubstr(s, i1, i2-i1+1);
}
