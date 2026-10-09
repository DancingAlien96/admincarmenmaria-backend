-- CreateTable
CREATE TABLE `SurveyCriterion` (
    `id` VARCHAR(191) NOT NULL,
    `fase` INTEGER NOT NULL,
    `grupo` VARCHAR(191) NOT NULL,
    `clave` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `detalle` TEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SurveyCriterion_fase_active_idx`(`fase`, `active`),
    UNIQUE INDEX `SurveyCriterion_fase_clave_key`(`fase`, `clave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- Criterios iniciales (los mismos 10 de antes) en cada fase; las claves
-- coinciden con las respuestas ya guardadas.
INSERT INTO `SurveyCriterion` (`id`, `fase`, `grupo`, `clave`, `nombre`, `detalle`, `order`, `active`, `createdAt`) VALUES
    ('enc_f1_aulas', 1, 'Instalaciones', 'aulas', 'Aulas y espacios de aprendizaje', 'Comodidad, iluminación, ventilación y espacio suficiente para las clases teóricas', 1, true, CURRENT_TIMESTAMP(3)),
    ('enc_f1_equipamiento', 1, 'Instalaciones', 'equipamiento', 'Equipamiento y material didáctico', 'Proyectores, pizarras, modelos anatómicos y recursos audiovisuales disponibles', 2, true, CURRENT_TIMESTAMP(3)),
    ('enc_f1_laboratorios', 1, 'Instalaciones', 'laboratorios', 'Laboratorios y áreas de práctica', 'Disponibilidad, estado del equipo y condiciones para prácticas de bioseguridad', 3, true, CURRENT_TIMESTAMP(3)),
    ('enc_f1_dominio', 1, 'Docentes', 'dominio', 'Dominio del tema', 'Conocimiento profundo y actualizado de los contenidos impartidos en la fase', 4, true, CURRENT_TIMESTAMP(3)),
    ('enc_f1_claridad', 1, 'Docentes', 'claridad', 'Claridad en la enseñanza', 'Capacidad para explicar conceptos complejos de forma comprensible y estructurada', 5, true, CURRENT_TIMESTAMP(3)),
    ('enc_f1_disponibilidad', 1, 'Docentes', 'disponibilidad', 'Disponibilidad para consultas', 'Accesibilidad fuera del horario de clase para resolver dudas y brindar orientación', 6, true, CURRENT_TIMESTAMP(3)),
    ('enc_f1_trato', 1, 'Docentes', 'trato', 'Trato y comunicación', 'Respeto, empatía y retroalimentación constructiva hacia los estudiantes', 7, true, CURRENT_TIMESTAMP(3)),
    ('enc_f1_relevancia', 1, 'Contenido', 'relevancia', 'Relevancia de los temas', 'Utilidad y pertinencia de los contenidos para la formación como profesional de enfermería', 8, true, CURRENT_TIMESTAMP(3)),
    ('enc_f1_organizacion', 1, 'Contenido', 'organizacion', 'Organización del material', 'Estructura lógica de las presentaciones, guías y recursos proporcionados por el docente', 9, true, CURRENT_TIMESTAMP(3)),
    ('enc_f1_aplicabilidad', 1, 'Contenido', 'aplicabilidad', 'Aplicabilidad práctica', 'Conexión entre la teoría y los procedimientos clínicos reales en el ámbito hospitalario', 10, true, CURRENT_TIMESTAMP(3)),
    ('enc_f2_aulas', 2, 'Instalaciones', 'aulas', 'Aulas y espacios de aprendizaje', 'Comodidad, iluminación, ventilación y espacio suficiente para las clases teóricas', 1, true, CURRENT_TIMESTAMP(3)),
    ('enc_f2_equipamiento', 2, 'Instalaciones', 'equipamiento', 'Equipamiento y material didáctico', 'Proyectores, pizarras, modelos anatómicos y recursos audiovisuales disponibles', 2, true, CURRENT_TIMESTAMP(3)),
    ('enc_f2_laboratorios', 2, 'Instalaciones', 'laboratorios', 'Laboratorios y áreas de práctica', 'Disponibilidad, estado del equipo y condiciones para prácticas de bioseguridad', 3, true, CURRENT_TIMESTAMP(3)),
    ('enc_f2_dominio', 2, 'Docentes', 'dominio', 'Dominio del tema', 'Conocimiento profundo y actualizado de los contenidos impartidos en la fase', 4, true, CURRENT_TIMESTAMP(3)),
    ('enc_f2_claridad', 2, 'Docentes', 'claridad', 'Claridad en la enseñanza', 'Capacidad para explicar conceptos complejos de forma comprensible y estructurada', 5, true, CURRENT_TIMESTAMP(3)),
    ('enc_f2_disponibilidad', 2, 'Docentes', 'disponibilidad', 'Disponibilidad para consultas', 'Accesibilidad fuera del horario de clase para resolver dudas y brindar orientación', 6, true, CURRENT_TIMESTAMP(3)),
    ('enc_f2_trato', 2, 'Docentes', 'trato', 'Trato y comunicación', 'Respeto, empatía y retroalimentación constructiva hacia los estudiantes', 7, true, CURRENT_TIMESTAMP(3)),
    ('enc_f2_relevancia', 2, 'Contenido', 'relevancia', 'Relevancia de los temas', 'Utilidad y pertinencia de los contenidos para la formación como profesional de enfermería', 8, true, CURRENT_TIMESTAMP(3)),
    ('enc_f2_organizacion', 2, 'Contenido', 'organizacion', 'Organización del material', 'Estructura lógica de las presentaciones, guías y recursos proporcionados por el docente', 9, true, CURRENT_TIMESTAMP(3)),
    ('enc_f2_aplicabilidad', 2, 'Contenido', 'aplicabilidad', 'Aplicabilidad práctica', 'Conexión entre la teoría y los procedimientos clínicos reales en el ámbito hospitalario', 10, true, CURRENT_TIMESTAMP(3)),
    ('enc_f3_aulas', 3, 'Instalaciones', 'aulas', 'Aulas y espacios de aprendizaje', 'Comodidad, iluminación, ventilación y espacio suficiente para las clases teóricas', 1, true, CURRENT_TIMESTAMP(3)),
    ('enc_f3_equipamiento', 3, 'Instalaciones', 'equipamiento', 'Equipamiento y material didáctico', 'Proyectores, pizarras, modelos anatómicos y recursos audiovisuales disponibles', 2, true, CURRENT_TIMESTAMP(3)),
    ('enc_f3_laboratorios', 3, 'Instalaciones', 'laboratorios', 'Laboratorios y áreas de práctica', 'Disponibilidad, estado del equipo y condiciones para prácticas de bioseguridad', 3, true, CURRENT_TIMESTAMP(3)),
    ('enc_f3_dominio', 3, 'Docentes', 'dominio', 'Dominio del tema', 'Conocimiento profundo y actualizado de los contenidos impartidos en la fase', 4, true, CURRENT_TIMESTAMP(3)),
    ('enc_f3_claridad', 3, 'Docentes', 'claridad', 'Claridad en la enseñanza', 'Capacidad para explicar conceptos complejos de forma comprensible y estructurada', 5, true, CURRENT_TIMESTAMP(3)),
    ('enc_f3_disponibilidad', 3, 'Docentes', 'disponibilidad', 'Disponibilidad para consultas', 'Accesibilidad fuera del horario de clase para resolver dudas y brindar orientación', 6, true, CURRENT_TIMESTAMP(3)),
    ('enc_f3_trato', 3, 'Docentes', 'trato', 'Trato y comunicación', 'Respeto, empatía y retroalimentación constructiva hacia los estudiantes', 7, true, CURRENT_TIMESTAMP(3)),
    ('enc_f3_relevancia', 3, 'Contenido', 'relevancia', 'Relevancia de los temas', 'Utilidad y pertinencia de los contenidos para la formación como profesional de enfermería', 8, true, CURRENT_TIMESTAMP(3)),
    ('enc_f3_organizacion', 3, 'Contenido', 'organizacion', 'Organización del material', 'Estructura lógica de las presentaciones, guías y recursos proporcionados por el docente', 9, true, CURRENT_TIMESTAMP(3)),
    ('enc_f3_aplicabilidad', 3, 'Contenido', 'aplicabilidad', 'Aplicabilidad práctica', 'Conexión entre la teoría y los procedimientos clínicos reales en el ámbito hospitalario', 10, true, CURRENT_TIMESTAMP(3));
