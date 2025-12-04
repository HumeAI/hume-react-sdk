'use client';
import type { ToolCallHandler } from '@humeai/voice-react';
import { VoiceProvider } from '@humeai/voice-react';
import { useCallback, useState } from 'react';
import { z } from 'zod';

import { ExampleComponent } from '@/components/ExampleComponent';

export const Voice = ({
  accessToken,
  configId,
}: {
  accessToken: string;
  configId?: string;
}) => {
  const [enableAudioWorklet, setEnableAudioWorklet] = useState(true);

  const onToolCall = useCallback<ToolCallHandler>(
    async (toolCall, response) => {
      if (toolCall.name === 'weather_tool') {
        try {
          const args = z
            .object({
              location: z.string(),
              format: z.enum(['fahrenheit', 'celsius']),
            })
            .safeParse(JSON.parse(toolCall.parameters));

          if (args.success === false) {
            throw new Error(
              'Tool response did not match the expected weather tool schema',
            );
          }

          const location: unknown = await fetch(
            `https://geocode.maps.co/search?q=${String(args.data.location)}&api_key=${process.env.NEXT_PUBLIC_GEOCODE_API_KEY}`,
          ).then((res) => res.json());

          const locationResults = z
            .array(
              z.object({
                lat: z.string(),
                lon: z.string(),
              }),
            )
            .safeParse(location);

          if (locationResults.success === false) {
            throw new Error(
              'Location results did not match the expected schema',
            );
          }
          const { lat, lon } = locationResults.data[0];
          const pointMetadataEndpoint: string = `https://api.weather.gov/points/${parseFloat(lat).toFixed(3)},${parseFloat(lon).toFixed(3)}`;

          const result: unknown = await fetch(pointMetadataEndpoint, {
            method: 'GET',
          }).then((res) => res.json());

          const json = z
            .object({
              properties: z.object({
                forecast: z.string(),
              }),
            })
            .safeParse(result);
          if (json.success === false) {
            throw new Error('Point metadata did not match the expected schema');
          }
          const { properties } = json.data;
          const { forecast: forecastUrl } = properties;

          const forecastResult: unknown = await fetch(forecastUrl).then((res) =>
            res.json(),
          );

          const forecastJson = z
            .object({
              properties: z.object({
                periods: z.array(z.unknown()),
              }),
            })
            .safeParse(forecastResult);
          if (forecastJson.success === false) {
            throw new Error('Forecast did not match the expected schema');
          }
          const forecast = forecastJson.data.properties.periods;

          return response.success(forecast);
        } catch (error) {
          return response.error({
            error: 'Weather tool error',
            code: 'weather_tool_error',
            level: 'error',
            content: 'There was an error with the weather tool',
          });
        }
      } else {
        return response.error({
          error: 'Tool not found',
          code: 'tool_not_found',
          level: 'warning',
          content: 'The tool you requested was not found',
        });
      }
    },
    [],
  );

  return (
    <>
      <div className="flex py-4">
        <label>
          <input
            className="mr-2"
            type="checkbox"
            checked={enableAudioWorklet}
            onChange={(val) => {
              setEnableAudioWorklet(val.target.checked);
            }}
          />
          Enable audio worklet
        </label>
      </div>

      <VoiceProvider
        messageHistoryLimit={10}
        enableAudioWorklet={enableAudioWorklet}
        onOpen={() => {
          // eslint-disable-next-line no-console
          console.log('onOpen');
        }}
        onMessage={(message) => {
          // eslint-disable-next-line no-console
          console.log('message', message);
        }}
        onError={(message) => {
          // eslint-disable-next-line no-console
          console.log('onError', message);
        }}
        onAudioStart={(clipId) => {
          // eslint-disable-next-line no-console
          console.log('Start playing clip with ID:', clipId);
        }}
        onAudioEnd={(clipId) => {
          // eslint-disable-next-line no-console
          console.log('Stop playing clip with ID:', clipId);
        }}
        onInterruption={(message) => {
          // eslint-disable-next-line no-console
          console.log(
            'Interruption triggered on the following message',
            message,
          );
        }}
        {...(configId ? { onToolCall } : {})}
        onClose={(event) => {
          // eslint-disable-next-line no-console
          console.log('onClose', event);
          const niceClosure = 1000;
          const code = event.code;

          if (code !== niceClosure) {
            // eslint-disable-next-line no-console
            console.error('close event was not nice', event);
          }
        }}
      >
        <ExampleComponent accessToken={accessToken} configId={configId} />
      </VoiceProvider>
    </>
  );
};
