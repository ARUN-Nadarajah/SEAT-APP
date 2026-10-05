const { api, fixture } = require('./setup');

describe('Table management (FR08)', () => {
  test('staff can create a table with details', async () => {
    const response = await api(fixture.tokens.staff)
      .post('/api/tables')
      .send({
        restaurantId: fixture.restaurantId,
        tableNumber: 'T99',
        capacity: 6,
        location: 'Window',
        type: 'Window',
        status: 'available',
      })
      .expect(201);

    expect(response.body.data.tableNumber).toBe('T99');
    expect(response.body.data.capacity).toBe(6);
    expect(response.body.data.location).toBe('Window');
    expect(response.body.data.type).toBe('Window');
    expect(response.body.data.status).toBe('available');
  });

  test('staff can update a table capacity and details', async () => {
    const response = await api(fixture.tokens.staff)
      .patch(`/api/tables/${fixture.tableIds[0]}`)
      .send({
        capacity: 8,
        location: 'Patio',
        type: 'Outdoor',
        status: 'reserved',
      })
      .expect(200);

    expect(response.body.data.capacity).toBe(8);
    expect(response.body.data.location).toBe('Patio');
    expect(response.body.data.type).toBe('Outdoor');
    expect(response.body.data.status).toBe('reserved');
  });
});
