"use client";

import { useMemo, useState } from "react";
import styles from "./consultation-reports.module.css";

export interface ConsultationRouteModule {
  id: string;
  name: string;
  parentModuleId: string | null;
}

interface ConsultationRouteFieldsProps {
  initialModuleId: string | null;
  initialSubmoduleId: string | null;
  roots: ConsultationRouteModule[];
  submodules: ConsultationRouteModule[];
}

function initialRootId({
  initialModuleId,
  initialSubmoduleId,
  roots,
  submodules,
}: ConsultationRouteFieldsProps): string {
  if (roots.some((module) => module.id === initialModuleId)) {
    return initialModuleId ?? "";
  }
  return (
    submodules.find((module) => module.id === initialSubmoduleId)
      ?.parentModuleId ?? ""
  );
}

export function ConsultationRouteFields(props: ConsultationRouteFieldsProps) {
  const [moduleId, setModuleId] = useState(() => initialRootId(props));
  const [submoduleId, setSubmoduleId] = useState(() => {
    const rootId = initialRootId(props);
    return props.submodules.some(
      (module) =>
        module.id === props.initialSubmoduleId &&
        module.parentModuleId === rootId,
    )
      ? (props.initialSubmoduleId ?? "")
      : "";
  });
  const availableSubmodules = useMemo(
    () =>
      props.submodules.filter((module) => module.parentModuleId === moduleId),
    [moduleId, props.submodules],
  );

  return (
    <div className={styles.formGrid}>
      <label htmlFor="case-module-route">
        Módulo principal detectado
        <select
          id="case-module-route"
          name="detectedModuleId"
          onChange={(event) => {
            const nextModuleId = event.target.value;
            setModuleId(nextModuleId);
            setSubmoduleId((currentSubmoduleId) =>
              props.submodules.some(
                (module) =>
                  module.id === currentSubmoduleId &&
                  module.parentModuleId === nextModuleId,
              )
                ? currentSubmoduleId
                : "",
            );
          }}
          value={moduleId}
        >
          <option value="">Sin módulo</option>
          {props.roots.map((module) => (
            <option key={module.id} value={module.id}>
              {module.name}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor="case-submodule-route">
        Submódulo detectado
        <select
          aria-describedby="case-route-help"
          disabled={!moduleId}
          id="case-submodule-route"
          name="detectedSubmoduleId"
          onChange={(event) => setSubmoduleId(event.target.value)}
          value={submoduleId}
        >
          <option value="">Sin submódulo</option>
          {availableSubmodules.map((module) => (
            <option key={module.id} value={module.id}>
              {module.name}
            </option>
          ))}
        </select>
      </label>
      <p className={`${styles.meta} ${styles.routeHelp}`} id="case-route-help">
        El submódulo se limita al módulo principal seleccionado.
      </p>
    </div>
  );
}
