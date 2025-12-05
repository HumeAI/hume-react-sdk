import { fetchAccessToken } from 'hume';

import { Voice } from '@/components/Voice';

export default async function Home() {
  if (!process.env.HUME_API_KEY || !process.env.HUME_SECRET_KEY) {
    return (
      <div className={'p-6'}>
        <h1 className={'my-4 text-lg font-medium'}>Hume EVI React Example</h1>
        <div>
          Please set your HUME_API_KEY and HUME_SECRET_KEY environment variables
        </div>
      </div>
    );
  }
  const accessToken = await fetchAccessToken({
    apiKey: process.env.HUME_API_KEY,
    secretKey: process.env.HUME_SECRET_KEY,
  });

  const configId = process.env.HUME_CONFIG_ID;

  return (
    <div className={'p-6'}>
      <h1 className={'my-4 text-lg font-medium'}>Hume EVI React Example</h1>
      <Voice accessToken={accessToken} configId={configId} />
    </div>
  );
}
