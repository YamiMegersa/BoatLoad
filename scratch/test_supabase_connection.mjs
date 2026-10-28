const url = 'https://fhupjmxzsmacdueleiba.supabase.co';
const key = 'sb_publishable_rop85JXZ-kRPkcaid7pGIw_9KdRJQTq';

async function testConnection() {
  console.log('Testing Supabase PostgREST connection...');
  try {
    const res = await fetch(`${url}/rest/v1/levels?select=*&limit=5`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    console.log('Levels table HTTP status:', res.status);
    const body = await res.text();
    console.log('Response body:', body);
  } catch (err) {
    console.error('Fetch failed:', err);
  }

  console.log('\nTesting Supabase Storage bucket level-payloads...');
  try {
    const res = await fetch(`${url}/storage/v1/bucket/level-payloads`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    console.log('Bucket check HTTP status:', res.status);
    const body = await res.text();
    console.log('Bucket response:', body);
  } catch (err) {
    console.error('Bucket fetch failed:', err);
  }
}

testConnection();
