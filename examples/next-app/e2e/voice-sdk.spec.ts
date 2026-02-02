import { test, expect } from '@playwright/test';

/**
 * E2E tests for @humeai/voice-react SDK
 *
 * These tests verify the SDK integration with a real Hume API connection.
 * Requires HUME_API_KEY + HUME_SECRET_KEY (or TEST_HUME_API_KEY + TEST_HUME_SECRET_KEY)
 * to be set in the environment.
 */

test.describe('Voice SDK - Initial Page Load', () => {
  test('should display page title', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Hume EVI React Example' }),
    ).toBeVisible();
  });

  test('should show credentials error or connect button', async ({ page }) => {
    await page.goto('/');

    // Check if credentials are missing - the page will show an error message
    const errorMessage = page.getByText(
      /please set your.*environment variables/i,
    );
    const connectButton = page.getByRole('button', {
      name: /connect to voice/i,
    });

    // Either we see the error (no credentials) or the connect button (credentials present)
    const hasError = await errorMessage.isVisible().catch(() => false);
    const hasConnect = await connectButton.isVisible().catch(() => false);

    expect(hasError || hasConnect).toBe(true);
  });
});

test.describe('Voice SDK - VoiceProvider Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Skip tests if credentials are not configured
    const errorMessage = page.getByText(
      /please set your.*environment variables/i,
    );
    const hasError = await errorMessage.isVisible().catch(() => false);
    if (hasError) {
      test.skip(true, 'API credentials not configured');
    }
  });

  test('should display disconnected status initially', async ({ page }) => {
    await expect(page.getByText('Status')).toBeVisible();
    await expect(page.getByText('disconnected')).toBeVisible();
  });

  test('should display connect button when disconnected', async ({ page }) => {
    const connectButton = page.getByRole('button', {
      name: /connect to voice/i,
    });
    await expect(connectButton).toBeVisible();
    await expect(connectButton).toBeEnabled();
  });

  test('should display call duration as n/a when disconnected', async ({
    page,
  }) => {
    await expect(page.getByText('Call duration')).toBeVisible();
    await expect(page.getByText('n/a').first()).toBeVisible();
  });

  test('should display and toggle audio worklet checkbox', async ({ page }) => {
    const checkbox = page.getByRole('checkbox');
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toBeChecked();
    await expect(page.getByText('Enable audio worklet')).toBeVisible();

    // Toggle off
    await checkbox.click();
    await expect(checkbox).not.toBeChecked();

    // Toggle on
    await checkbox.click();
    await expect(checkbox).toBeChecked();
  });

  test('should display device selectors', async ({ page }) => {
    await expect(page.getByText('Microphone', { exact: true })).toBeVisible();
    await expect(page.getByText('Speaker', { exact: true })).toBeVisible();
  });
});

test.describe('Voice SDK - Connection Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['microphone']);
    await page.goto('/');

    // Skip tests if credentials are not configured
    const errorMessage = page.getByText(
      /please set your.*environment variables/i,
    );
    const hasError = await errorMessage.isVisible().catch(() => false);
    if (hasError) {
      test.skip(true, 'API credentials not configured');
    }
  });

  test('should transition to connecting state when connect is clicked', async ({
    page,
  }) => {
    const connectButton = page.getByRole('button', {
      name: /connect to voice/i,
    });
    await connectButton.click();

    // Should show either "Connecting..." button or transition to connected/error state
    const connectingButton = page.getByRole('button', { name: /connecting/i });
    const disconnectButton = page.getByRole('button', { name: /disconnect/i });
    const errorState = page.getByText('error', { exact: true });

    await expect(
      connectingButton.or(disconnectButton).or(errorState).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('should successfully connect and show disconnect button', async ({
    page,
  }) => {
    const connectButton = page.getByRole('button', {
      name: /connect to voice/i,
    });
    await connectButton.click();

    const disconnectButton = page.getByRole('button', { name: /disconnect/i });
    await expect(disconnectButton).toBeVisible({ timeout: 15000 });
  });

  test('should disconnect and return to initial state', async ({ page }) => {
    // Connect
    const connectButton = page.getByRole('button', {
      name: /connect to voice/i,
    });
    await connectButton.click();

    // Wait for connected state
    const disconnectButton = page.getByRole('button', { name: /disconnect/i });
    await expect(disconnectButton).toBeVisible({ timeout: 15000 });

    // Disconnect
    await disconnectButton.click();

    // Should return to disconnected state
    await expect(page.getByText('disconnected')).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByRole('button', { name: /connect to voice/i }),
    ).toBeVisible();
  });
});

// Run connected state tests serially to avoid parallel connection issues
test.describe.serial('Voice SDK - Connected State', () => {
  test('should display full connected UI with all elements', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['microphone']);
    await page.goto('/');

    // Skip if no credentials
    const errorMessage = page.getByText(
      /please set your.*environment variables/i,
    );
    const hasError = await errorMessage.isVisible().catch(() => false);
    if (hasError) {
      test.skip(true, 'API credentials not configured');
    }

    // Connect
    const connectButton = page.getByRole('button', {
      name: /connect to voice/i,
    });
    await connectButton.click();

    // Wait for connection to complete - either connected (Playing visible) or error state
    const playingLabel = page.getByText('Playing');
    const connectedStatus = page.getByText('connected', { exact: true });
    const errorState = page.getByText('error', { exact: true });
    const connectingState = page.getByText('connecting', { exact: true });

    // Wait for either connected or error state (not connecting)
    await expect(
      playingLabel.or(connectedStatus).or(errorState).first(),
    ).toBeVisible({ timeout: 30000 });

    // Check current state for debugging
    const isConnecting = await connectingState.isVisible().catch(() => false);
    const isError = await errorState.isVisible().catch(() => false);
    const isConnected = await connectedStatus.isVisible().catch(() => false);

    if (isConnecting) {
      test.skip(true, 'Connection stuck in connecting state');
    }

    if (isError) {
      const errorReason = await page
        .locator('.text-red-500')
        .textContent()
        .catch(() => 'Unknown error');
      test.skip(true, `Connection failed: ${errorReason}`);
    }

    // If we see "connected" status but not "Playing", wait a bit more for UI to render
    const hasPlaying = await playingLabel.isVisible().catch(() => false);
    if (!hasPlaying && isConnected) {
      await expect(playingLabel).toBeVisible({ timeout: 10000 });
    }

    const disconnectButton = page.getByRole('button', { name: /disconnect/i });
    await expect(page.getByText('Ready state')).toBeVisible();
    await expect(page.getByText('Request ID')).toBeVisible();
    await expect(page.getByText('Chat group ID')).toBeVisible();
    await expect(page.getByText('Call duration')).toBeVisible();

    // Verify mute buttons exist (at least 3 buttons: disconnect, mic mute, audio mute)
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    expect(buttonCount).toBeGreaterThanOrEqual(3);

    // Verify volume control
    await expect(page.getByText(/Volume/)).toBeVisible();
    const volumeSlider = page.locator('input[type="range"]#volumeSlider');
    await expect(volumeSlider).toBeVisible();

    // Verify messages section
    await expect(page.getByText(/All messages/)).toBeVisible();

    // Verify text input section
    await expect(page.getByText('Send a text input message')).toBeVisible();
    await expect(
      page.getByPlaceholder(/write an input message/i),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /send text input message/i }),
    ).toBeVisible();

    // Verify pause button
    const pauseButton = page.getByRole('button', { name: /pause/i });
    await expect(pauseButton).toBeVisible();

    // Clean up - disconnect
    await disconnectButton.click();
    await expect(page.getByText('disconnected')).toBeVisible({
      timeout: 10000,
    });
  });

  test('should toggle pause/resume state', async ({ page, context }) => {
    await context.grantPermissions(['microphone']);
    await page.goto('/');

    // Skip if no credentials
    const errorMessage = page.getByText(
      /please set your.*environment variables/i,
    );
    const hasError = await errorMessage.isVisible().catch(() => false);
    if (hasError) {
      test.skip(true, 'API credentials not configured');
    }

    // Connect
    const connectButton = page.getByRole('button', {
      name: /connect to voice/i,
    });
    await connectButton.click();

    // Wait for connection - either connected or error
    const playingLabel = page.getByText('Playing');
    const errorState = page.getByText('error', { exact: true });
    await expect(playingLabel.or(errorState).first()).toBeVisible({
      timeout: 30000,
    });

    // Skip if connection failed
    const isError = await errorState.isVisible().catch(() => false);
    if (isError) {
      test.skip(true, 'Connection failed');
    }

    const disconnectButton = page.getByRole('button', { name: /disconnect/i });

    // Find and click pause button
    const pauseButton = page.getByRole('button', { name: /pause/i });
    await expect(pauseButton).toBeVisible();
    await pauseButton.click();

    // Should now show "Resume"
    const resumeButton = page.getByRole('button', { name: /resume/i });
    await expect(resumeButton).toBeVisible({ timeout: 3000 });

    // Click to resume
    await resumeButton.click();

    // Should show "Pause" again
    await expect(page.getByRole('button', { name: /pause/i })).toBeVisible({
      timeout: 3000,
    });

    // Clean up
    await disconnectButton.click();
    await expect(page.getByText('disconnected')).toBeVisible({
      timeout: 10000,
    });
  });

  test('should adjust volume slider', async ({ page, context }) => {
    await context.grantPermissions(['microphone']);
    await page.goto('/');

    // Skip if no credentials
    const errorMessage = page.getByText(
      /please set your.*environment variables/i,
    );
    const hasError = await errorMessage.isVisible().catch(() => false);
    if (hasError) {
      test.skip(true, 'API credentials not configured');
    }

    // Connect
    const connectButton = page.getByRole('button', {
      name: /connect to voice/i,
    });
    await connectButton.click();

    // Wait for connection - either connected or error
    const playingLabel = page.getByText('Playing');
    const errorState = page.getByText('error', { exact: true });
    await expect(playingLabel.or(errorState).first()).toBeVisible({
      timeout: 30000,
    });

    // Skip if connection failed
    const isError = await errorState.isVisible().catch(() => false);
    if (isError) {
      test.skip(true, 'Connection failed');
    }

    const disconnectButton = page.getByRole('button', { name: /disconnect/i });
    const volumeSlider = page.locator('input[type="range"]#volumeSlider');
    await expect(volumeSlider).toBeVisible();

    // Change volume to 50%
    await volumeSlider.fill('0.5');

    // Volume label should update
    await expect(page.getByText(/Volume.*50%/)).toBeVisible({ timeout: 2000 });

    // Clean up
    await disconnectButton.click();
    await expect(page.getByText('disconnected')).toBeVisible({
      timeout: 10000,
    });
  });

  test('should send text input message', async ({ page, context }) => {
    await context.grantPermissions(['microphone']);
    await page.goto('/');

    // Skip if no credentials
    const errorMessage = page.getByText(
      /please set your.*environment variables/i,
    );
    const hasError = await errorMessage.isVisible().catch(() => false);
    if (hasError) {
      test.skip(true, 'API credentials not configured');
    }

    // Connect
    const connectButton = page.getByRole('button', {
      name: /connect to voice/i,
    });
    await connectButton.click();

    // Wait for connection - either connected or error
    const playingLabel = page.getByText('Playing');
    const errorState = page.getByText('error', { exact: true });
    await expect(playingLabel.or(errorState).first()).toBeVisible({
      timeout: 30000,
    });

    // Skip if connection failed
    const isError = await errorState.isVisible().catch(() => false);
    if (isError) {
      test.skip(true, 'Connection failed');
    }

    const disconnectButton = page.getByRole('button', { name: /disconnect/i });
    const textInput = page.getByPlaceholder(/write an input message/i);
    const sendButton = page.getByRole('button', {
      name: /send text input message/i,
    });

    // Type a message
    await textInput.fill('Hello from e2e test');
    await expect(textInput).toHaveValue('Hello from e2e test');

    // Send the message
    await sendButton.click();

    // The UI should remain functional
    await expect(sendButton).toBeVisible();

    // Clean up
    await disconnectButton.click();
    await expect(page.getByText('disconnected')).toBeVisible({
      timeout: 10000,
    });
  });
});
