export function formatNumber(value: number): string {
  return value.toLocaleString('ru-RU');
}

export function formatCurrency(value: number): string {
  return `${formatNumber(value)} ₽`;
}

export function formatDateTime(value?: string): string {
  if (!value) return '—';

  try {
    return new Date(value).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

export function getRunDuration(createdAt?: string, completedAt?: string): string {
  if (!createdAt) return '—';

  const start = new Date(createdAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const diff = Math.max(0, Math.floor((end - start) / 1000));
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;

  if (mins === 0) return `${secs}с`;
  return `${mins}м ${secs}с`;
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'running':
      return 'В процессе';
    case 'completed':
      return 'Завершён';
    case 'failed':
      return 'Ошибка';
    case 'pending':
      return 'Ожидание';
    default:
      return 'Нет данных';
  }
}
