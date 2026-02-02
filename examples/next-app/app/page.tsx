import { fetchAccessToken } from 'hume';

import { Voice } from '@/components/Voice';

export default async function Home() {
  // Support both HUME_* (local .env) and TEST_HUME_* (CI secrets)
  const apiKey =
    process.env.HUME_API_KEY ?? process.env.TEST_HUME_API_KEY ?? '';
  const secretKey =
    process.env.HUME_SECRET_KEY ?? process.env.TEST_HUME_SECRET_KEY ?? '';

  if (!apiKey || !secretKey) {
    return (
      <div className={'p-6'}>
        <h1 className={'my-4 text-lg font-medium'}>Hume EVI React Example</h1>
        <div>
          Please set your HUME_API_KEY and HUME_SECRET_KEY environment
          variables (or TEST_HUME_API_KEY and TEST_HUME_SECRET_KEY for CI)
        </div>
      </div>
    );
  }
  const accessToken = await fetchAccessToken({
    apiKey,
    secretKey,
  });

  const configId = process.env.HUME_CONFIG_ID;

  return (
    <div className={'p-6'}>
      <h1 className={'my-4 text-lg font-medium'}>Hume EVI React Example</h1>
      <Voice accessToken={accessToken} configId={configId} />
    </div>
  );
}
