import { render, screen } from '@testing-library/react-native';

import { Button } from '../Button';
import { EmptyState, ErrorState } from '../states';
import { LastUpdated, relativeLabel } from '../LastUpdated';

// RNTL v14 renders asynchronously (React 19), so every test awaits render.
describe('EmptyState (NFR05: empty states everywhere)', () => {
  test('renders title, message and an optional action', async () => {
    await render(
      <EmptyState
        title="No waiting today. Yet."
        message="Join a queue and your spot appears here."
        action={<Button label="Find a place to eat" onPress={() => undefined} />}
      />,
    );

    expect(screen.getByText('No waiting today. Yet.')).toBeTruthy();
    expect(screen.getByText('Join a queue and your spot appears here.')).toBeTruthy();
    expect(screen.getByText('Find a place to eat')).toBeTruthy();
  });

  test('renders without an action', async () => {
    await render(<EmptyState title="Nothing here" message="Check back later." />);
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });
});

describe('ErrorState (NFR05: error states everywhere)', () => {
  test('shows the reason and offers a retry', async () => {
    const onRetry = jest.fn();
    await render(<ErrorState message="Network unreachable." onRetry={onRetry} />);

    expect(screen.getByText('We couldn’t load that')).toBeTruthy();
    expect(screen.getByText('Network unreachable.')).toBeTruthy();

    await screen.getByText('Tap to try again').props.onPress();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('LastUpdated (NFR03)', () => {
  test('relativeLabel says "just now" for very recent stamps', () => {
    expect(relativeLabel(new Date().toISOString())).toBe('Updated just now');
  });

  test('relativeLabel falls back when the stamp is missing or invalid', () => {
    expect(relativeLabel(null)).toBe('Updated just now');
    expect(relativeLabel('not-a-date')).toBe('Updated just now');
  });

  test('renders a live label when provided', async () => {
    await render(
      <LastUpdated timestamp={new Date().toISOString()} live label="Live estimate" />,
    );
    expect(screen.getByText('Live estimate')).toBeTruthy();
  });
});
