import { useState, useCallback } from 'react';

export interface FormOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  resetOnSuccess?: boolean;
  validate?: (data: T) => Record<string, string> | null;
}

export function useForm<T extends Record<string, any>>(
  initialData: T,
  submitFn: (data: T) => Promise<void>,
  options: FormOptions<T> = {}
) {
  const {
    onSuccess,
    onError,
    resetOnSuccess = false,
    validate,
  } = options;

  const [formData, setFormData] = useState<T>(initialData);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});

  const updateField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const clone = { ...prev };
        delete clone[field];
        return clone;
      });
    }
  }, [errors]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (validate) {
      const validationErrors = validate(formData);
      if (validationErrors) {
        setErrors(validationErrors as Partial<Record<keyof T, string>>);
        return;
      }
    }

    setIsSubmitting(true);
    setErrors({});
    try {
      await submitFn(formData);
      onSuccess?.(formData);
      if (resetOnSuccess) {
        setFormData(initialData);
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Submission failed');
      onError?.(e);
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, submitFn, validate, onSuccess, onError, resetOnSuccess, initialData]);

  const reset = useCallback(() => {
    setFormData(initialData);
    setErrors({});
  }, [initialData]);

  return {
    formData,
    setFormData,
    updateField,
    isSubmitting,
    errors,
    handleSubmit,
    reset,
  };
}


