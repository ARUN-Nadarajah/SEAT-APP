import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '../Button';

// RNTL v14 renders asynchronously (React 19), so every test awaits render.
describe('Button', () => {
  test('renders its label', async () => {
    await render(<Button label="Reserve a table" />);
    expect(screen.getByText('Reserve a table')).toBeTruthy();
  });

  test('fires onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<Button label="Join the queue" onPress={onPress} />);

    await fireEvent.press(screen.getByText('Join the queue'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('does not fire when disabled (error prevention)', async () => {
    const onPress = jest.fn();
    await render(<Button label="Confirm reservation" onPress={onPress} disabled />);

    await fireEvent.press(screen.getByText('Confirm reservation'));
    expect(onPress).not.toHaveBeenCalled();
  });

  test('does not fire while loading, and exposes busy state', async () => {
    const onPress = jest.fn();
    await render(<Button label="Sign in" onPress={onPress} loading />);

    expect(screen.getByLabelText('Sign in').props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
    await fireEvent.press(screen.getByLabelText('Sign in'));
    expect(onPress).not.toHaveBeenCalled();
  });

  test('uses a custom accessibility label when provided (spec §9)', async () => {
    await render(
      <Button label="Join the queue · 15–25 min" accessibilityLabel="Join the virtual queue" />,
    );
    expect(screen.getByLabelText('Join the virtual queue')).toBeTruthy();
  });
});
