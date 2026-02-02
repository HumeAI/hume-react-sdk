import { expect, test } from '@playwright/test';

test.describe('Voice SDK - Initial Page Load', () => {
  test('should display page title', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Hume EVI React Example' }),
    ).toBeVisible();
  });

  test('should show credentials error or connect button', async ({ page }) => {
    await page.goto('/');
    const errorMessage = page.getByText(
      /please set your.*environment variables/i,
    );
    const connectButton = page.getByRole('button', {
      name: /connect to voice/i,
    });
    const hasError = await errorMessage.isVisible().catch(() => false);
    const hasConnect = await connectButton.isVisible().catch(() => false);
    expect(hasError || hasConnect).toBe(true);
  });
});

test.describe('Voice SDK - VoiceProvider Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
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
    await checkbox.click();
    await expect(checkbox).not.toBeChecked();
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
    const errorMessage = page.getByText(
      /please set your.*environment variables/i,
    );
    const hasError = await errorMessage.isVisible().catch(() => false);
    if (hasError) {
      test.skip(true, 'API credentials not configured');
    }
  });

  test('should transition when connect is clicked', async ({ page }) => {
    const connectButton = page.getByRole('button', {
      name: /connect to voice/i,
    });
    await connectButton.click();
    const connectingButton = page.getByRole('button', { name: /connecting/i });
    const disconnectButton = page.getByRole('button', { name: /disconnect/i });
    const errorState = page.getByText('error', { exact: true });
    await expect(
      connectingButton.or(disconnectButton).or(errorState).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('should connect and show disconnect button', async ({ page }) => {
    const connectButton = page.getByRole('button', {
      name: /connect to voice/i,
    });
    await connectButton.click();
    const disconnectButton = page.getByRole('button', { name: /disconnect/i });
    await expect(disconnectButton).toBeVisible({ timeout: 15000 });
  });

  test('should disconnect and return to initial state', async ({ page }) => {
    const connectButton = page.getByRole('button', {
      name: /connect to voice/i,
    });
    await connectButton.click();
    const disconnectButton = page.getByRole('button', { name: /disconnect/i });
    await expect(disconnectButton).toBeVisible({ timeout: 15000 });
    await disconnectButton.click();
    await expect(page.getByText('disconnected')).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByRole('button', { name: /connect to voice/i }),
    ).toBeVisible();
  });
});

test.describe.serial('Voice SDK - Assistant / audio response', () => {
  test('should connect and receive assistant response (audio/chat from API)', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['microphone']);
    await page.goto('/');

    const errorMessage = page.getByText(
      /please set your.*environment variables/i,
    );
    const hasError = await errorMessage.isVisible().catch(() => false);
    if (hasError) {
      test.skip(true, 'API credentials not configured');
    }

    // Connect using real API (credentials from .env or CI TEST_HUME_*)
    const connectButton = page.getByRole('button', {
      name: /connect to voice/i,
    });
    await connectButton.click();

    // Wait for ChatConnected UI (confirms we are connected to the API)
    await expect(page.getByText('Playing')).toBeVisible({ timeout: 30000 });
    const disconnectButton = page.getByRole('button', { name: /disconnect/i });

    // Send a text message to trigger an assistant response
    const textInput = page.getByPlaceholder(/write an input message/i);
    const sendButton = page.getByRole('button', {
      name: /send text input message/i,
    });
    await textInput.fill('Hello');
    await sendButton.click();

    // Wait for assistant response from API (chat/audio). ChatConnected shows assistant messages with "Assistant" label in "All messages" list.
    const assistantLabelInList = page.getByText('Assistant', { exact: true });

    // Assistant response should appear within 45s (API round-trip + TTS/audio)
    await expect(assistantLabelInList.first()).toBeVisible({ timeout: 45000 });

    // Verify "All messages" shows at least 2 (user + assistant)
    const allMessagesHeading = page.getByText(/All messages \(\d+\)/);
    await expect(allMessagesHeading).toBeVisible();
    const headingText = await allMessagesHeading.textContent();
    const match = headingText?.match(/All messages \((\d+)\)/);
    const count = match ? Number(match[1]) : 0;
    expect(count).toBeGreaterThanOrEqual(2);

    await disconnectButton.click();
    await expect(page.getByText('disconnected')).toBeVisible({
      timeout: 10000,
    });
  });
});
