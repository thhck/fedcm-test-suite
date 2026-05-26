import { test, expect, type CDPSession, type Page, type BrowserContext } from '@playwright/test';

/**
 * FedCM IdP Registration E2E Test
 *
 * Tests the FedCM IdP registration flow:
 * 1. Login to IdP at localhost:3000
 * 2. Navigate to RP at localhost:6080
 * 3. Click "Register IdP to FedCM" and handle the registration dialog via CDP
 * 4. Click "Log in" and handle FedCM consent via CDP
 * 5. Verify successful authentication
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
      // Step 1: Open IdP login page and authenticate
      const idpPage = await context.newPage();
      await idpPage.goto(IDP_LOGIN_URL);
      await idpPage.waitForTimeout(1000);

      // Fill in credentials
      await idpPage.fill('input[name="email"], input[type="email"], #email', TEST_EMAIL);
      await idpPage.fill('input[name="password"], input[type="password"], #password', TEST_PASSWORD);

      await idpPage.waitForTimeout(1000);
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

      // Navigate to RP
      await rpPage.goto(RP_URL);

      // Step 3: Click "Register IdP to FedCM" button
      // Set up promise to wait for FedCM IdP registration dialog
      const registrationDialogPromise = new Promise<FedCmDialogEvent>((resolve) => {
        cdpSession.once('FedCm.dialogShown', (event: FedCmDialogEvent) => {
          resolve(event);
        });
      });

      await rpPage.click('button:has-text("Register IdP to FedCM"), a:has-text("Register IdP to FedCM"), [data-testid="register-idp"]');

      // Wait for and handle the IdP registration dialog
      const registrationDialogEvent = await registrationDialogPromise;

      console.log('FedCM IdP Registration Dialog shown:', {
        dialogId: registrationDialogEvent.dialogId,
        dialogType: registrationDialogEvent.dialogType,
        title: registrationDialogEvent.title,
      });

      // Wait so you can see the FedCM dialog before it's clicked
      await rpPage.waitForTimeout(1000);

      // Handle the registration dialog - click Continue/Confirm
      if (registrationDialogEvent.dialogType === 'ConfirmIdpLogin') {
        await cdpSession.send('FedCm.clickDialogButton', {
          dialogId: registrationDialogEvent.dialogId,
          dialogButton: 'ConfirmIdpLoginContinue',
        });
      } else {
        // For other dialog types, try selecting account or clicking continue
        await cdpSession.send('FedCm.selectAccount', {
          dialogId: registrationDialogEvent.dialogId,
          accountIndex: 0,
        });
      }

      // Wait for registration to complete
      await rpPage.waitForTimeout(1000);

      // Step 4: Now click "Log in" button to trigger the actual FedCM login flow
      const loginDialogPromise = new Promise<FedCmDialogEvent>((resolve) => {
        cdpSession.once('FedCm.dialogShown', (event: FedCmDialogEvent) => {
          resolve(event);
        });
      });

      await rpPage.click('button:has-text("Log in"), button:has-text("Login"), a:has-text("Log in"), [data-testid="login"]');

      // Wait for and handle FedCM login dialog
      const loginDialogEvent = await loginDialogPromise;

      console.log('FedCM Login Dialog shown:', {
        dialogId: loginDialogEvent.dialogId,
        dialogType: loginDialogEvent.dialogType,
        accounts: loginDialogEvent.accounts?.map(a => a.email),
      });

      // Wait so you can see the FedCM dialog before it's clicked
      await rpPage.waitForTimeout(1000);

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

      // Step 5: Wait and verify login success
      // Give time for the authentication to complete
      await rpPage.waitForTimeout(1000);

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
