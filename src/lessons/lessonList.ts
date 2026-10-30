import type { LessonMeta } from '../types/lesson';
import { aiMeta } from './meta/ai';
import { algorithmsMeta } from './meta/algorithms';
import { dataStructuresMeta } from './meta/data-structures';
import { kubernetesMeta } from './meta/kubernetes';
import { microservicesMeta } from './meta/microservices';
import { securityMeta } from './meta/security';
import { sqlMeta } from './meta/sql';

/**
 * Every live lesson's metadata, in recommended learning order. Pages read this without loading
 * any lesson; a lesson's content (src/lessons/<category>/<id>.ts) loads when it is opened.
 */
export const lessons: LessonMeta[] = [...dataStructuresMeta, ...algorithmsMeta, ...sqlMeta, ...microservicesMeta, ...kubernetesMeta, ...aiMeta, ...securityMeta];
