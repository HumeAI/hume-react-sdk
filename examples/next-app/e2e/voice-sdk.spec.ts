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
