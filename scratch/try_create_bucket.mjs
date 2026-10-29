const url = 'https://fhupjmxzsmacdueleiba.supabase.co';
const key = 'sb_publishable_rop85JXZ-kRPkcaid7pGIw_9KdRJQTq';

async function tryCreateBucket() {
  console.log('Attempting to create bucket level-payloads via API...');
  const res = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: 'level-payloads',
      name: 'level-payloads',
      public: true,
      file_size_limit: 1048576,
      allowed_mime_types: ['application/json']
    })
  });
  console.log('Status:', res.status);
  console.log('Response:', await res.text());
}

tryCreateBucket();
