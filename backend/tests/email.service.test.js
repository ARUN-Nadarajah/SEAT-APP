const emailService = require('../src/services/email.service');

describe('Email Service - Mailjet HTTP API', () => {
  const originalEnv = process.env;
  let originalFetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.MAILJET_API_KEY = 'test-api-key';
    process.env.MAILJET_SECRET_KEY = 'test-secret-key';
    process.env.EMAIL_FROM = 'Seat App <noreply@seat-app.local>';
    process.env.NODE_ENV = 'test';

    originalFetch = global.fetch;
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('Configuration & Parsing', () => {
    test('hasMailjetConfiguration detects when credentials are present or missing', () => {
      expect(emailService.hasMailjetConfiguration()).toBe(true);

      process.env.MAILJET_API_KEY = '';
      expect(emailService.hasMailjetConfiguration()).toBe(false);

      process.env.MAILJET_API_KEY = 'test-api-key';
      process.env.MAILJET_SECRET_KEY = '';
      expect(emailService.hasMailjetConfiguration()).toBe(false);
    });

    test('parseEmail parses raw email strings and formatted names', () => {
      expect(emailService.parseEmail('user@test.local')).toEqual({
        Email: 'user@test.local',
      });

      expect(emailService.parseEmail('John Doe <john@test.local>')).toEqual({
        Email: 'john@test.local',
        Name: 'John Doe',
      });

      expect(emailService.parseEmail('"Jane Smith" <jane@test.local>')).toEqual({
        Email: 'jane@test.local',
        Name: 'Jane Smith',
      });

      expect(emailService.parseEmail({ email: 'user@test.local', name: 'User' })).toEqual({
        Email: 'user@test.local',
        Name: 'User',
      });

      expect(emailService.parseEmail({ Email: 'user@test.local', Name: 'User' })).toEqual({
        Email: 'user@test.local',
        Name: 'User',
      });
    });

    test('formatRecipients formats single, array, and object recipients', () => {
      expect(emailService.formatRecipients('single@test.local', 'Default Name')).toEqual([
        { Email: 'single@test.local', Name: 'Default Name' },
      ]);

      expect(
        emailService.formatRecipients([
          'one@test.local',
          'Two <two@test.local>',
          { email: 'three@test.local', name: 'Three' },
        ]),
      ).toEqual([
        { Email: 'one@test.local' },
        { Email: 'two@test.local', Name: 'Two' },
        { Email: 'three@test.local', Name: 'Three' },
      ]);
    });
  });

  describe('sendViaMailjet HTTP requests', () => {
    test('dispatches POST to Mailjet v3.1 with Basic Auth and correct message payload', async () => {
      const mockResponseData = {
        Messages: [
          {
            Status: 'success',
            To: [
              {
                Email: 'recipient@test.local',
                MessageUUID: 'uuid-1234',
                MessageID: 987654321,
                MessageHref: 'https://api.mailjet.com/v3/message/987654321',
              },
            ],
          },
        ],
      };

      let capturedUrl = null;
      let capturedOptions = null;

      global.fetch = jest.fn(async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(mockResponseData),
          json: async () => mockResponseData,
        };
      });

      const result = await emailService.sendMail({
        to: 'recipient@test.local',
        subject: 'Seat App verification code',
        text: 'Your code is 123456',
        html: '<p>Your code is 123456</p>',
        name: 'Recipient User',
      });

      expect(capturedUrl).toBe('https://api.mailjet.com/v3.1/send');
      expect(capturedOptions.method).toBe('POST');

      // Verify Basic Auth header
      const expectedBasicAuth = `Basic ${Buffer.from('test-api-key:test-secret-key').toString('base64')}`;
      expect(capturedOptions.headers.Authorization).toBe(expectedBasicAuth);
      expect(capturedOptions.headers['Content-Type']).toBe('application/json');

      // Verify body
      const parsedBody = JSON.parse(capturedOptions.body);
      expect(parsedBody.Messages).toHaveLength(1);
      const msg = parsedBody.Messages[0];
      expect(msg.From).toEqual({ Email: 'noreply@seat-app.local', Name: 'Seat App' });
      expect(msg.To).toEqual([{ Email: 'recipient@test.local', Name: 'Recipient User' }]);
      expect(msg.Subject).toBe('Seat App verification code');
      expect(msg.TextPart).toBe('Your code is 123456');
      expect(msg.HTMLPart).toBe('<p>Your code is 123456</p>');

      // Verify return value compatibility
      expect(result.messageId).toBe('987654321');
      expect(result.status).toBe('success');
    });

    test('handles OTP verification email payload matching auth.service structure', async () => {
      const otpCode = '849201';
      const email = 'user@example.com';
      const recipientName = 'Alex Doe';

      let capturedBody = null;
      global.fetch = jest.fn(async (url, options) => {
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              Messages: [{ Status: 'success', To: [{ MessageID: 112233 }] }],
            }),
          json: async () => ({
            Messages: [{ Status: 'success', To: [{ MessageID: 112233 }] }],
          }),
        };
      });

      // Emulate auth.service.js createOtpChallenge payload
      const otpPayload = {
        to: email,
        subject: 'Seat App verification code',
        text: `Your Seat App verification code is ${otpCode}. It expires in 10 minutes.`,
        html: `<div>Code: ${otpCode}</div>`,
        name: recipientName,
      };

      const result = await emailService.sendMail(otpPayload);

      expect(result.messageId).toBe('112233');
      expect(capturedBody.Messages[0].Subject).toBe('Seat App verification code');
      expect(capturedBody.Messages[0].TextPart).toContain('849201');
      expect(capturedBody.Messages[0].HTMLPart).toContain('849201');
      expect(capturedBody.Messages[0].To[0].Email).toBe('user@example.com');
    });

    test('handles password reset OTP email with exact text and HTML formatting', async () => {
      const resetCode = '391054';
      const email = 'reset-user@example.com';

      let capturedBody = null;
      global.fetch = jest.fn(async (url, options) => {
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              Messages: [{ Status: 'success', To: [{ MessageID: 'reset-msg-7788' }] }],
            }),
          json: async () => ({
            Messages: [{ Status: 'success', To: [{ MessageID: 'reset-msg-7788' }] }],
          }),
        };
      });

      const result = await emailService.sendMail({
        to: email,
        subject: 'Seat App verification code',
        text: `Your Seat App verification code is ${resetCode}. It expires in 10 minutes.`,
        html: `
				<div style="font-family: Arial, sans-serif; line-height: 1.5; color: #23181A;">
					<h2 style="color: #6B1E2E;">Seat App verification code</h2>
					<p>Hello Alex,</p>
					<p>Your verification code is:</p>
					<div style="font-size: 28px; font-weight: 700; letter-spacing: 4px; color: #6B1E2E;">${resetCode}</div>
					<p>This code expires in 10 minutes.</p>
				</div>
			`,
      });

      expect(result.messageId).toBe('reset-msg-7788');
      expect(capturedBody.Messages[0].TextPart).toContain('391054');
      expect(capturedBody.Messages[0].HTMLPart).toContain('391054');
      expect(capturedBody.Messages[0].To[0].Email).toBe('reset-user@example.com');
    });

    test('never uses nodemailer or SMTP transports', () => {
      const emailServiceCode = require('fs').readFileSync(
        require('path').resolve(__dirname, '../src/services/email.service.js'),
        'utf8',
      );
      expect(emailServiceCode).not.toContain('nodemailer');
      expect(emailServiceCode).not.toContain('createTransport');
      expect(emailServiceCode).not.toContain('SMTP_HOST');
    });
  });

  describe('Error Handling and Logging', () => {
    test('throws and logs when Mailjet returns an HTTP error status (e.g. 401 Unauthorized)', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () =>
          JSON.stringify({
            ErrorCode: 'mj-0001',
            ErrorMessage: 'Invalid API key or secret',
            StatusCode: 401,
          }),
      }));

      await expect(
        emailService.sendMail({
          to: 'customer@test.local',
          subject: 'Test',
          text: 'Hello',
        }),
      ).rejects.toThrow('Mailjet API error (401): Invalid API key or secret [mj-0001]');

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    test('throws and logs when Mailjet returns HTTP 200 with message-level error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            Messages: [
              {
                Status: 'error',
                Errors: [
                  {
                    ErrorIdentifier: 'err-123',
                    ErrorCode: 'mj-0013',
                    StatusCode: 400,
                    ErrorMessage: 'Sender email not authorized',
                  },
                ],
              },
            ],
          }),
      }));

      await expect(
        emailService.sendMail({
          to: 'customer@test.local',
          subject: 'Test',
          text: 'Hello',
        }),
      ).rejects.toThrow('Mailjet message rejected: Sender email not authorized [mj-0013]');

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    test('throws and logs when fetch experiences a network failure', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      global.fetch = jest.fn(async () => {
        throw new TypeError('Failed to fetch (DNS / Network down)');
      });

      await expect(
        emailService.sendMail({
          to: 'customer@test.local',
          subject: 'Test',
          text: 'Hello',
        }),
      ).rejects.toThrow('Mailjet network connection failed: Failed to fetch (DNS / Network down)');

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    test('throws when recipient email is missing or invalid', async () => {
      await expect(
        emailService.sendMail({
          to: '',
          subject: 'Test',
          text: 'Hello',
        }),
      ).rejects.toThrow('No valid recipient email address provided');
    });
  });

  describe('Fallback behavior when credentials are unset', () => {
    test('simulates email delivery and logs to console in development mode', async () => {
      process.env.MAILJET_API_KEY = '';
      process.env.MAILJET_SECRET_KEY = '';
      process.env.NODE_ENV = 'development';

      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

      const result = await emailService.sendMail({
        to: 'dev@test.local',
        subject: 'Dev Email',
        text: 'Development message body',
      });

      expect(result.messageId).toBe('fallback-console');
      expect(result.status).toBe('simulated');
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[mailjet:fallback] Simulated email to dev@test.local'),
      );
    });

    test('throws an error when credentials are unset in production mode', async () => {
      process.env.MAILJET_API_KEY = '';
      process.env.MAILJET_SECRET_KEY = '';
      process.env.NODE_ENV = 'production';

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        emailService.sendMail({
          to: 'prod@test.local',
          subject: 'Prod Email',
          text: 'Production message body',
        }),
      ).rejects.toThrow('Mailjet API credentials (MAILJET_API_KEY, MAILJET_SECRET_KEY) are not configured.');

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});
