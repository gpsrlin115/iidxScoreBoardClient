import apiClient from './client';
import { createProfileApi } from './profileClient';

export const profileApi = createProfileApi(apiClient);
