import http.client, json, threading, unittest
from server import ThreadingHTTPServer, MCPHandler, PROTOCOL_VERSION, MAX_BODY

class Harness(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd=ThreadingHTTPServer(("127.0.0.1",0), MCPHandler); cls.port=cls.httpd.server_address[1]
        cls.th=threading.Thread(target=cls.httpd.serve_forever,daemon=True); cls.th.start()
    @classmethod
    def tearDownClass(cls): cls.httpd.shutdown(); cls.httpd.server_close()
    def req(self, method="POST", path="/mcp", body=None, sid=None, proto=True, origin=None, accept="application/json, text/event-stream"):
        c=http.client.HTTPConnection("127.0.0.1",self.port,timeout=2)
        headers={"Accept":accept}
        if body is not None: headers["Content-Type"]="application/json"
        if sid: headers["MCP-Session-Id"]=sid
        if sid and proto: headers["MCP-Protocol-Version"]=PROTOCOL_VERSION
        if origin is not None: headers["Origin"]=origin
        if isinstance(body,(dict,list)): body=json.dumps(body)
        c.request(method,path,body=body,headers=headers); r=c.getresponse(); data=r.read(); hs=dict(r.getheaders()); c.close()
        try: payload=json.loads(data) if data else None
        except: payload=data
        return r.status,hs,payload
    def init(self):
        s,h,p=self.req(body={"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}); return s,h["MCP-Session-Id"],p
    def call(self,sid,name,args=None,idx=2):
        return self.req(body={"jsonrpc":"2.0","id":idx,"method":"tools/call","params":{"name":name,"arguments":args or {}}},sid=sid)
    def test_01_initialize_200(self): self.assertEqual(self.init()[0],200)
    def test_02_protocol(self): self.assertEqual(self.init()[2]["result"]["protocolVersion"],PROTOCOL_VERSION)
    def test_03_entropy(self): self.assertGreater(len(self.init()[1]),32)
    def test_04_invalid_origin(self): self.assertEqual(self.req(body={"jsonrpc":"2.0","id":1,"method":"initialize"},origin="https://evil.example")[0],403)
    def test_05_accept_missing_sse(self): self.assertEqual(self.req(body={"jsonrpc":"2.0","id":1,"method":"initialize"},accept="application/json")[0],406)
    def test_06_tools_list(self):
        _,sid,_=self.init(); s,_,p=self.req(body={"jsonrpc":"2.0","id":2,"method":"tools/list"},sid=sid); self.assertEqual(s,200); self.assertGreaterEqual(len(p["result"]["tools"]),7)
    def test_07_missing_session(self): self.assertEqual(self.req(body={"jsonrpc":"2.0","id":2,"method":"tools/list"})[0],400)
    def test_08_bad_protocol(self):
        _,sid,_=self.init(); self.assertEqual(self.req(body={"jsonrpc":"2.0","id":2,"method":"tools/list"},sid=sid,proto=False)[0],400)
    def test_09_initialized_202(self):
        _,sid,_=self.init(); self.assertEqual(self.req(body={"jsonrpc":"2.0","method":"notifications/initialized"},sid=sid)[0],202)
    def test_10_get_405(self): self.assertEqual(self.req(method="GET",body=None)[0],405)
    def test_11_block_without_approval(self):
        _,sid,_=self.init(); _,_,p=self.call(sid,"continuity.execute_irreversible",{"effect_id":"x","idempotency_key":"a"}); self.assertFalse(p["result"]["structuredContent"]["ok"])
    def test_12_execute_after_approval(self):
        _,sid,_=self.init(); self.call(sid,"continuity.approve"); _,_,p=self.call(sid,"continuity.execute_irreversible",{"effect_id":"x","idempotency_key":"a"}); self.assertTrue(p["result"]["structuredContent"]["executed"])
    def test_13_approval_consumed(self):
        _,sid,_=self.init(); self.call(sid,"continuity.approve"); self.call(sid,"continuity.execute_irreversible",{"effect_id":"x","idempotency_key":"a"}); _,_,p=self.call(sid,"continuity.execute_irreversible",{"effect_id":"y","idempotency_key":"b"}); self.assertEqual(p["result"]["structuredContent"]["error"],"approval_required")
    def test_14_delete(self):
        _,sid,_=self.init(); self.assertEqual(self.req(method="DELETE",sid=sid)[0],204)
    def test_15_post_delete_404(self):
        _,sid,_=self.init(); self.req(method="DELETE",sid=sid); self.assertEqual(self.req(body={"jsonrpc":"2.0","id":2,"method":"tools/list"},sid=sid)[0],404)
    def test_16_malformed_json(self): self.assertEqual(self.req(body="{broken")[0],400)
    def test_17_invalid_jsonrpc(self): self.assertEqual(self.req(body={"id":1,"method":"initialize"})[0],400)
    def test_18_unknown_method(self):
        _,sid,_=self.init(); _,_,p=self.req(body={"jsonrpc":"2.0","id":2,"method":"wat"},sid=sid); self.assertEqual(p["error"]["code"],-32601)
    def test_19_unknown_tool(self):
        _,sid,_=self.init(); _,_,p=self.call(sid,"nope"); self.assertEqual(p["error"]["code"],-32602)
    def test_20_wrong_path(self): self.assertEqual(self.req(path="/wrong",body={"jsonrpc":"2.0","id":1,"method":"initialize"})[0],404)
    def test_21_random_session_404(self): self.assertEqual(self.req(body={"jsonrpc":"2.0","id":2,"method":"tools/list"},sid="bogus-session")[0],404)
    def test_22_body_limit(self):
        huge="x"*(MAX_BODY+1); self.assertEqual(self.req(body=huge)[0],413)
    def test_23_idempotent_replay(self):
        _,sid,_=self.init(); self.call(sid,"continuity.approve"); _,_,p1=self.call(sid,"continuity.execute_irreversible",{"effect_id":"x","idempotency_key":"same"}); _,_,p2=self.call(sid,"continuity.execute_irreversible",{"effect_id":"x","idempotency_key":"same"}); self.assertTrue(p1["result"]["structuredContent"]["executed"]); self.assertTrue(p2["result"]["structuredContent"]["replayed"])
    def test_24_idempotency_required(self):
        _,sid,_=self.init(); self.call(sid,"continuity.approve"); _,_,p=self.call(sid,"continuity.execute_irreversible",{"effect_id":"x"}); self.assertEqual(p["result"]["structuredContent"]["error"],"idempotency_key_required")
    def test_25_resume_preserves_checkpoint(self):
        _,sid,_=self.init(); self.call(sid,"continuity.start"); self.call(sid,"continuity.checkpoint"); _,_,a=self.call(sid,"continuity.status"); cp=a["result"]["structuredContent"]["checkpoint"]; self.call(sid,"continuity.resume"); _,_,b=self.call(sid,"continuity.status"); self.assertEqual(cp,b["result"]["structuredContent"]["checkpoint"])
    def test_26_ledger_records(self):
        _,sid,_=self.init(); self.call(sid,"continuity.start"); _,_,p=self.call(sid,"continuity.ledger"); self.assertGreaterEqual(len(p["result"]["structuredContent"]["events"]),1)
    def test_27_sessions_isolated(self):
        _,a,_=self.init(); _,b,_=self.init(); self.call(a,"continuity.start"); _,_,pb=self.call(b,"continuity.status"); self.assertEqual(pb["result"]["structuredContent"]["state"],"created")
    def test_28_concurrent_replay_exactly_once(self):
        _,sid,_=self.init(); self.call(sid,"continuity.approve")
        outs=[]
        def f(): outs.append(self.call(sid,"continuity.execute_irreversible",{"effect_id":"x","idempotency_key":"k"})[2]["result"]["structuredContent"])
        ts=[threading.Thread(target=f) for _ in range(8)]; [t.start() for t in ts]; [t.join() for t in ts]
        self.assertEqual(sum(1 for o in outs if o.get("executed")),1); self.assertEqual(sum(1 for o in outs if o.get("replayed")),7)
    def test_29_origin_localhost_allowed(self): self.assertEqual(self.req(body={"jsonrpc":"2.0","id":1,"method":"initialize"},origin="http://localhost")[0],200)
    def test_30_invalid_arguments_type(self):
        _,sid,_=self.init(); _,_,p=self.req(body={"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"continuity.status","arguments":[]}},sid=sid); self.assertEqual(p["error"]["code"],-32602)

if __name__=="__main__": unittest.main(verbosity=2)
