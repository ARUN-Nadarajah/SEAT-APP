const { api, fixture } = require('./setup');

describe('Auth (spec §7)', () => {
  test('logs in and returns an access + refresh token pair', async () => {
    const response = await api()
      .post('/api/auth/login')
      .send({ email: 'customer@test.local', password: 'Password123!'})
      .expect(200);

    expect(response.body.status).toBe('success');
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.refreshToken).toEqual(expect.any(String));
    expect(response.body.data.user.role).toBe('customer');
    // NFR04 — never leak the hash.
    expect(JSON.stringify(response.body)).not.toContain('$2b$');
  });

  test('rejects a wrong password with 401', async () => {
    await api()
      .post('/api/auth/login')
      .send({ email: 'customer@test.local', password: 'not-the-password' })
      .expect(401);
  });

  test('rejects malformed input with 400', async () => {
    await api().post('/api/auth/login').send({ email: 'nope' }).expect(400);
  });

  test('returns the current profile via /auth/me', async () => {
    const response = await api(fixture.tokens.customer)
      .get('/api/auth/me')
      .expect(200);

    expect(response.body.data.user.email).toBe('customer@test.local');
    expect(response.body.data.user.notificationPrefs).toBeDefined();
    expect(response.body.data.user).not.toHaveProperty('passwordHash');
  });

  test('exchanges a refresh token for a new pair', async () => {
    const login = await api()
      .post('/api/auth/login')
      .send({ email: 'customer@test.local', password: 'Password123!'})
      .expect(200);

    const response = await api()
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.data.refreshToken })
      .expect(200);

    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.refreshToken).not.toBe(login.body.data.refreshToken);
  });

  test('rejects an invalid refresh token', async () => {
    await api()
      .post('/api/auth/refresh')
      .send({ refreshToken: 'not.a.token' })
      .expect(401);
  });

  test('updates notification preferences via PATCH /auth/me', async () => {
    const response = await api(fixture.tokens.customer)
      .patch('/api/auth/me')
      .send({ notificationPrefs: { email: false, sms: true } })
      .expect(200);

    expect(response.body.data.user.notificationPrefs.email).toBe(false);
    expect(response.body.data.user.notificationPrefs.sms).toBe(true);
    // Untouched keys are preserved.
    expect(response.body.data.user.notificationPrefs.push).toBe(false);
  });

  test('requires a token for protected routes', async () => {
    await api().get('/api/auth/me').expect(401);
    await api().get('/api/reservations').expect(401);
  });
});

describe('Role-based access control (spec §2 / NFR04)', () => {
  test('customers cannot read the staff queue', async () => {
    await api(fixture.tokens.customer)
      .get('/api/queue/staff/list')
      .query({ restaurantId: fixture.restaurantId })
      .expect(403);
  });

  test('customers cannot read manager stats', async () => {
    await api(fixture.tokens.customer)
      .get('/api/manager/stats')
      .query({ restaurantId: fixture.restaurantId })
      .expect(403);
  });

  test('staff cannot read manager stats but can read the floor', async () => {
    await api(fixture.tokens.staff)
      .get('/api/manager/stats')
      .query({ restaurantId: fixture.restaurantId })
      .expect(403);

    await api(fixture.tokens.staff)
      .get('/api/tables')
      .query({ restaurantId: fixture.restaurantId })
      .expect(200);
  });

  test('customers cannot toggle table status', async () => {
    await api(fixture.tokens.customer)
      .patch(`/api/tables/${fixture.tableIds[0]}/status`)
      .send({ status: 'occupied' })
      .expect(403);
  });
});
