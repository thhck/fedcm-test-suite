import { test, expect, type CDPSession, type Page, type BrowserContext } from '@playwright/test';

/**
 * FedCM E2E Test
 *
 * Tests the complete FedCM sign-in flow:
 * 1. Login to IdP at localhost:3000
 * 2. Navigate to RP at localhost:6090
 * 3. Trigger FedCM flow and handle consent via CDP
 * 4. Verify successful authentication
 */

const IDP_LOGIN_URL = 'http://localhost:3000/.account/login/password/';
const RP_URL = 'http://localhost:6090';
const TEST_EMAIL = 'alice@example.org';
const TEST_PASSWORD = 'alice';
const EXPECTED_LOGGED_IN_TEXT = 'You are logged in with http://localhost:3000/alice/profile/card#me';

interface FedCmDialogEvent {
  dialogId: string;
  dialogType: 'AccountChooser' | 'AutoReauthn' | 'ConfirmIdpLogin' | 'Error';
  accounts: Array<{
    accountId: string;
    email: string;
    name: string;
    givenName: string;
    pictureUrl: string;
    idpConfigUrl: string;
    idpLoginUrl: string;
    loginState: string;
    termsOfServiceUrl: string;
    privacyPolicyUrl: string;
  }>;
  title: string;
  subtitle?: string;
}

// Use Playwright's test fixtures which respect PLAYWRIGHT_BROWSERS_PATH
test.describe('FedCM E2E Login Flow', () => {
  test('should complete FedCM sign-in flow successfully', async ({ browser }) => {
    // Create a new context for isolation
    const context = await browser.newContext();

    try {
      // Step 1: Open IdP login page and authenticate
      const idpPage = await context.newPage();
      await idpPage.goto(IDP_LOGIN_URL);

      // Fill in credentials
      await idpPage.fill('input[name="email"], input[type="email"], #email', TEST_EMAIL);
      await idpPage.fill('input[name="password"], input[type="password"], #password', TEST_PASSWORD);

      // Click login button
      await idpPage.click('button[type="submit"], input[type="submit"], button:has-text("Log in")');

      // Wait for login to complete (page navigation or success indicator)
      await idpPage.waitForLoadState('networkidle');

      // Step 2: Open RP page in a new tab
      const rpPage = await context.newPage();

      // Create CDP session for FedCM automation
      const cdpSession = await context.newCDPSession(rpPage);

      // Enable FedCM CDP domain with rejection delay disabled for faster testing
      await cdpSession.send('FedCm.enable', {
        disableRejectionDelay: true,
      });

      // Set up promise to wait for FedCM dialog
      const dialogPromise = new Promise<FedCmDialogEvent>((resolve) => {
        cdpSession.on('FedCm.dialogShown', (event: FedCmDialogEvent) => {
          resolve(event);
        });
      });

      // Navigate to RP
      await rpPage.goto(RP_URL);

      // Step 3: Click "Solid-OIDC Login With FedCM" button
      await rpPage.click('button:has-text("Solid-OIDC Login With FedCM"), a:has-text("Solid-OIDC Login With FedCM"), [data-testid="fedcm-login"]');

      // Step 4: Wait for and handle FedCM dialog
      const dialogEvent = await dialogPromise;

      console.log('FedCM Dialog shown:', {
        dialogId: dialogEvent.dialogId,
        dialogType: dialogEvent.dialogType,
        accounts: dialogEvent.accounts?.map(a => a.email),
      });

      // Wait so you can see the FedCM dialog before it's clicked
      await rpPage.waitForTimeout(1500);

      // Handle dialog based on type
      if (dialogEvent.dialogType === 'AccountChooser' || dialogEvent.dialogType === 'AutoReauthn') {
        // Select the first (and only) account - this also confirms/continues
        await cdpSession.send('FedCm.selectAccount', {
          dialogId: dialogEvent.dialogId,
          accountIndex: 0,
        });
      } else if (dialogEvent.dialogType === 'ConfirmIdpLogin') {
        // Click continue button to proceed with IdP login
        await cdpSession.send('FedCm.clickDialogButton', {
          dialogId: dialogEvent.dialogId,
          dialogButton: 'ConfirmIdpLoginContinue',
        });
      }

      // Step 5: Wait and verify login success
      // Give time for the authentication to complete
      await rpPage.waitForTimeout(2000);

      // Check for the expected logged-in message
      await expect(rpPage.locator(`text=${EXPECTED_LOGGED_IN_TEXT}`)).toBeVisible({
        timeout: 10000,
      });

      // Cleanup
      await cdpSession.send('FedCm.disable');
    } finally {
      await context.close();
    }
  });
});
