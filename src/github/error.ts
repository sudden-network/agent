const isErrorWithStatus = (error: unknown): error is { status?: number } => {
  return Boolean(error && typeof error === 'object' && 'status' in error);
};

const getErrorStatus = (error: unknown): number | undefined => {
  if (!isErrorWithStatus(error)) return undefined;
  const { status } = error;
  return typeof status === 'number' ? status : undefined;
};

export const isPermissionError = (error: unknown): boolean => {
  return getErrorStatus(error) === 403;
};

export const isNotFoundError = (error: unknown): boolean => {
  return getErrorStatus(error) === 404;
};