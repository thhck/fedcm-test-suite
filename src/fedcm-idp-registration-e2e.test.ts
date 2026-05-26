import { test, expect, type CDPSession, type Page, type BrowserContext } from '@playwright/test';

/**
 * FedCM IdP Registration E2E Test
 *
 * Tests the FedCM sign-in flow on port 6080 with IdP registration:
 * 1. Navigate to IdP login page at localhost:3000
 * 2. Click "Register IdP to FedCM" button on IdP page
 * 3. Login to IdP
 * 4. Navigate to RP at localhost:6080
 * 5. Click "Solid-OIDC Login With FedCM" and handle FedCM consent via CDP
 * 6. Verify successful authentication
 */

const IDP_LOGIN_URL = 'http://localhost:3000/.account/login/password/';
const RP_URL = 'http://localhost:6080';
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
test.describe('FedCM IdP Registration Flow', () => {
  test('should register IdP and complete FedCM sign-in flow successfully', async ({ browser }) => {
    // Create a new context for isolation
    const context = await browser.newContext();

    try {
      // Step 1: Open IdP login page
      const idpPage = await context.newPage();
      await idpPage.goto(IDP_LOGIN_URL);

      // Step 2: Click "Register IdP to FedCM" button on IdP page
      await idpPage.click('button:has-text("Register IdP to FedCM"), #fedcm-registration');

      // Step 3: Fill in credentials and login
      await idpPage.fill('input[name="email"], input[type="email"], #email', TEST_EMAIL);
      await idpPage.fill('input[name="password"], input[type="password"], #password', TEST_PASSWORD);

      // Click login button
      await idpPage.click('button[type="submit"], input[type="submit"], button:has-text("Log in")');

      // Wait for login to complete (page navigation or success indicator)
      await idpPage.waitForLoadState('networkidle');

      // Step 4: Open RP page in a new tab
      const rpPage = await context.newPage();

      // Create CDP session for FedCM automation
      const cdpSession = await context.newCDPSession(rpPage);

      // Enable FedCM CDP domain with rejection delay disabled for faster testing
      await cdpSession.send('FedCm.enable', {
        disableRejectionDelay: true,
      });

      // Set up promise to wait for FedCM dialog
      const loginDialogPromise = new Promise<FedCmDialogEvent>((resolve) => {
        cdpSession.on('FedCm.dialogShown', (event: FedCmDialogEvent) => {
          resolve(event);
        });
      });

      // Navigate to RP
      await rpPage.goto(RP_URL);

      // Step 5: Click "Solid-OIDC Login With FedCM" button
      await rpPage.click('button:has-text("Solid-OIDC Login With FedCM"), a:has-text("Solid-OIDC Login With FedCM"), [data-testid="fedcm-login"]');

      // Wait for and handle FedCM login dialog
      const loginDialogEvent = await loginDialogPromise;

      console.log('FedCM Dialog shown:', {
        dialogId: loginDialogEvent.dialogId,
        dialogType: loginDialogEvent.dialogType,
        accounts: loginDialogEvent.accounts?.map(a => a.email),
      });

      // Handle dialog based on type
      if (loginDialogEvent.dialogType === 'AccountChooser' || loginDialogEvent.dialogType === 'AutoReauthn') {
        // Select the first (and only) account - this also confirms/continues
        await cdpSession.send('FedCm.selectAccount', {
          dialogId: loginDialogEvent.dialogId,
          accountIndex: 0,
        });
      } else if (loginDialogEvent.dialogType === 'ConfirmIdpLogin') {
        // Click continue button to proceed with IdP login
        await cdpSession.send('FedCm.clickDialogButton', {
          dialogId: loginDialogEvent.dialogId,
          dialogButton: 'ConfirmIdpLoginContinue',
        });
      }

      // Step 6: Verify login success

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
