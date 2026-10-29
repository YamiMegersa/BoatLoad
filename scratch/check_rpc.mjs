const url = 'https://fhupjmxzsmacdueleiba.supabase.co';
const key = 'sb_publishable_rop85JXZ-kRPkcaid7pGIw_9KdRJQTq';

async function checkRpc() {
  const res = await fetch(`${url}/rest/v1/rpc/record_course_attempt`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_course_code: 'TEST-CODE-NONEXIST',
      p_cleared: false,
      p_time_ms: 0,
      p_player_name: 'Test'
    })
  });
  console.log('RPC check status:', res.status);
  console.log('RPC response:', await res.text());
}

checkRpc();
