import 'dotenv/config'
const idpHost = process.env.FEDCM_IDP_HOST || 'http://idp-1.localhost:8080';
const clientId = process.env.FEDCM_CLIENT_ID || 'yourClientID'
const clientOrigin = process.env.FEDCM_CLIENT_ORIGIN || 'http://localhost:7080'
export const authCookie = process.env.FEDCM_IDP_AUTH_COOKIE || "";
console.log(`using host:          ${idpHost}`)
console.log(`using clientOrigin:  ${clientOrigin}`)
console.log(`using clientId:      ${clientId}`)
console.log(`using auth cookie:   ${authCookie}`)

describe(`Identity Provider HTTP API for ${idpHost}`, () => {
  const wellKnownUrl = `${idpHost}/.well-known/web-identity`;

  describe('the Well-Known file', () => {
    // manifests | cookies: no | client_id: no | origin: no
    it('should return a 200', async () => {
      const response = await fetch(wellKnownUrl, withSecFetchHeader(baseRequestOptions));
      expect(response.status).toBe(200);
    })

    it('should return `Content-Type: application/json`', async () => {
      const response = await fetch(wellKnownUrl, withSecFetchHeader(baseRequestOptions));
      
      expect(response.headers.get('content-type')?.toLowerCase()).toContain('application/json') 
    })

    it('should return a IdentityProviderWellKnown JSON object that contain a `provider_urls` array', async () => {
      const response = await fetch(wellKnownUrl, withSecFetchHeader(baseRequestOptions));
      const wellKnowConfig: IdentityProviderWellKnown = await response.json() as IdentityProviderWellKnown;

      expect(Array.isArray(wellKnowConfig.provider_urls)).toBeTruthy();
    });

    it('should return 400 when Sec-Fetch-Dest is not set', async () => {
      const response = await fetch(wellKnownUrl, baseRequestOptions);

      expect(response.status).toBe(400);
    });

    it('should not have an empty `provider_urls` array', async () => {
      const response = await fetch(wellKnownUrl, withSecFetchHeader(baseRequestOptions));
      const wellKnowConfig: IdentityProviderWellKnown = await response.json() as IdentityProviderWellKnown;
      expect(wellKnowConfig.provider_urls.length).toBeGreaterThan(0) 
    });

    it('should return a valid provider url that returns a json file', async () => {
      const response = await fetch(wellKnownUrl, withSecFetchHeader(baseRequestOptions));
      const wellKnowConfig: IdentityProviderWellKnown = await response.json() as IdentityProviderWellKnown;
      const fedcmUrl = wellKnowConfig.provider_urls[0]
      const responseFedcm = await fetch(fedcmUrl, withSecFetchHeader(baseRequestOptions));
      const t = await responseFedcm.json() // this should throw an error and break the test if no json is returned
      expect(response.status).toBe(200);

    });


  })

  describe('other endpoints', () => {
    let wellKnownConfig: IdentityProviderWellKnown;
    let idpApiConfig: IdentityProviderAPIConfig;

    beforeEach(async () => {
      const wellKnownResponse = await fetch(wellKnownUrl, withSecFetchHeader(baseRequestOptions));
      wellKnownConfig = await wellKnownResponse.json() as IdentityProviderWellKnown;
    });

    describe('the config file', () => {
      // config | cookies: no | client_id: no | origin: no
      
      it('should return a 200', async () => {
        const response = await fetch(wellKnownConfig.provider_urls[0], withSecFetchHeader(baseRequestOptions));
        expect(response.status).toBe(200);
      })

      it('should return `Content-Type: application/json`', async () => {
        const response = await fetch(wellKnownConfig.provider_urls[0], withSecFetchHeader(baseRequestOptions));
      
        expect(response.headers.get('content-type')?.toLowerCase()).toContain('application/json') 
      })


      it('should return 400 when Sec-Fetch-Dest is not set', async () => {
        const response = await fetch(wellKnownConfig.provider_urls[0], baseRequestOptions);

        expect(response.status).toBe(400);
      });
      
      it('should return config file', async () => {
        const response = await fetch(wellKnownConfig.provider_urls[0], withSecFetchHeader(baseRequestOptions));
        const idpApiConfig = await response.json() as IdentityProviderAPIConfig;

        expect(idpApiConfig.accounts_endpoint).toEqual(expect.any(String));
        expect(idpApiConfig.id_assertion_endpoint).toEqual(expect.any(String));
        expect(idpApiConfig.login_url).toEqual(expect.any(String));
        // not required:
        // expect(idpApiConfig.client_metadata_endpoint).toEqual(expect.any(String));
        // expect(idpApiConfig.disconnect_endpoint).toEqual(expect.any(String));
        // expect(idpApiConfig.branding).toEqual(expect.any(Object));

      });
      // 
      // TODO if present,  check for branding  
      // TODO if present,  check for disconnect_endpoit
      // TODO if present,  check for supports_use_other_account
      // TODO if present,  check for account_label

    })

    // The accounts list endpoint provides the list of accounts
    // the user has at the IDP.
    describe('accounts list endpoint', () => {

      
      beforeEach(async () => {
        const wellKnownResponse = await fetch(wellKnownUrl, withSecFetchHeader(baseRequestOptions));        
        const response = await fetch(wellKnownConfig.provider_urls[0], withSecFetchHeader(baseRequestOptions));
        wellKnownConfig = await wellKnownResponse.json() as IdentityProviderWellKnown;
        idpApiConfig = await response.json() as IdentityProviderAPIConfig;
      });

      // accounts_endpoint | cookies: yes | client_id: no | origin: no
      it('should return a JSON with an accounts list array', async () => {
        const accountsEndpointURL: string = `${idpHost}${idpApiConfig?.accounts_endpoint}`;
        const response = await fetch(accountsEndpointURL, withAuthCookie(withSecFetchHeader(baseRequestOptions)));
        const data = await response.json() as IdentityProviderAccountList;

        expect(response.status).toBe(200);
        expect(Array.isArray(data.accounts)).toBe(true);
        expect(data.accounts.length).toBeGreaterThanOrEqual(1)
      });


      // This is yet to be clarified by the spec
      // see: https://github.com/w3c-fedid/FedCM/issues/218
      // we handle both possible case for now
      it('should return no accounts or 401 when no cookie is set', async () => {
        const accountsEndpointURL: string = `${idpHost}${idpApiConfig?.accounts_endpoint}`;
        const response = await fetch(accountsEndpointURL, withSecFetchHeader(baseRequestOptions));
        const data = await response.json() as IdentityProviderAccountList;

        if ( response.status == 200 ){
          expect(Array.isArray(data.accounts)).toBe(true);
          expect(data.accounts.length).toBe(0)
        }else{          
          expect(response.status).toBe(401);
        }
        
      });

      it('should return at least one account with valid cookie', async () => {
        const accountsEndpointURL: string = `${idpHost}${idpApiConfig?.accounts_endpoint}`;
        const response = await fetch(accountsEndpointURL, withAuthCookie(withSecFetchHeader(baseRequestOptions)));
        const data = await response.json() as IdentityProviderAccountList;

        if (data.accounts.length == 0) {
          throw new Error('No accounts found. Please register a client in the IdP')
        } else {
          const hasIdentifier = data.accounts[0].name     !== undefined ||
                                data.accounts[0].username !== undefined ||
                                data.accounts[0].email    !== undefined ||
                                data.accounts[0].tel      !== undefined
          expect(hasIdentifier).toBe(true)
          expect(data.accounts[0].id).toEqual(expect.any(String));
          expect(data.accounts[0].picture).toEqual(expect.any(String));
          expect(Array.isArray(data.accounts[0].approved_clients)).toBe(true);
          // expect(Array.isArray(data.accounts[0].login_hints)).toBe(true);
        }
      });

      it('should return 400 when Sec-Fetch-Dest is not set', async () => {
        const accountsEndpointURL: string = `${idpHost}${idpApiConfig?.accounts_endpoint}`;
        const response = await fetch(accountsEndpointURL, baseRequestOptions);

        expect(response.status).toBe(400);
      });

    })


    describe('client metadata', () => {
      // client_metadata_endpoint	 | cookies: no | client_id: yes | origin: yes
      it('should return client metadata', async () => {
        const clientMetadataEndpointURL: string = `${idpHost}${idpApiConfig?.client_metadata_endpoint}`;
        const response = await fetch(clientMetadataEndpointURL,
          withOriginHeader(
            withSecFetchHeader(baseRequestOptions))
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.privacy_policy_url).toEqual(expect.any(String));
        expect(data.terms_of_service_url).toEqual(expect.any(String));
      });
    })

    describe.skip('TODO: wip identity assertion endpoint', () => {
    describe('identity assertion endpoint', () => {
      // id_assertion_endpoint | cookies: yes | client_id: yes | origin: yes
      it('should return identity assertion', async () => {
        const accountsEndpointURL: string = `${idpHost}${idpApiConfig?.accounts_endpoint}`;
        const responseAccount = await fetch(accountsEndpointURL, withAuthCookie(withSecFetchHeader(baseRequestOptions)));
        const dataAccount = await responseAccount.json() as IdentityProviderAccountList;
        const accountId = dataAccount.accounts[0].id
        const idAssertionEndpointURL = `${idpHost}${idpApiConfig.id_assertion_endpoint}`;
        const nonce = Math.floor(Math.random() * 10e10).toString();
        const response = await fetch(idAssertionEndpointURL,
          withAuthCookie(
            withOriginHeader(
              withSecFetchHeader({
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'Accept': 'application/json'
                },
                body: new URLSearchParams({
                  client_id: clientId,
                  nonce: nonce,
                  account_id: accountId,
                  disclosure_text_shown: 'true',
                }),
              })))
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.token).toEqual(expect.any(String));
      });
    })
  })
});

const baseRequestOptions = {
  method: 'GET',
  headers: {
    'Accept': 'application/json'
  }
}

const withSecFetchHeader = (options: any) => {
  return {
    ...options,
    headers: {
      ...options.headers,
      'Sec-Fetch-Dest': 'webidentity',
    },
  };
};

const withAuthCookie = (options: any) => {
  return {
    ...options,
    headers: {
      ...options.headers,
      'Cookie': authCookie,
    },
  };
};

const withOriginHeader = (options: any) => {
  return {
    ...options,
    headers: {
      ...options.headers,
      'Origin': clientOrigin
    }
  }
}
})
