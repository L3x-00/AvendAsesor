import styles from "@/components/admin/modules-explorer.module.css";
import { ModulesExplorer } from "@/components/admin/modules-explorer";
import { createAuthorizedAdminApiContext } from "@/lib/admin-api/authorized-client";
import {
  parentOptions,
  rootModuleViews,
} from "@/lib/admin-api/module-hierarchy";

export default async function ModulesPage() {
  const { access, client } = await createAuthorizedAdminApiContext({
    requireModulesAccess: true,
  });
  const modules = await client.listModuleSummaries("all");

  return (
    <>
      <header className={styles.pageHeader}>
        <div aria-hidden="true" className={styles.headerWaves}>
          <svg
            fill="none"
            preserveAspectRatio="none"
            viewBox="0 0 520 220"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M0 96c96-64 168 12 252-18s120-62 268-40v182H0z"
              fill="#d6e9ff"
              opacity=".55"
            />
            <path
              d="M0 140c104-48 168 22 268-6s132-56 252-34v120H0z"
              fill="#c3ddfb"
              opacity=".45"
            />
            <path
              d="M0 178c112-34 188 16 288-4s136-38 232-24v70H0z"
              fill="#b4d5fa"
              opacity=".3"
            />
          </svg>
        </div>
        <div className={styles.headerContent}>
          <p>Administración</p>
          <h1>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5" />
            </svg>
            Módulos
          </h1>
          <p>
            Organiza la biblioteca por módulos y submódulos. La carga principal
            se realiza dentro del módulo o submódulo correspondiente.
          </p>
        </div>
      </header>
      <div className={styles.pageBody}>
        <div className="avend-admin-content">
          <ModulesExplorer
            canCreate={access.role === "superadmin"}
            context={{ kind: "root" }}
            modules={rootModuleViews(modules)}
            parents={parentOptions(modules)}
          />
        </div>
      </div>
    </>
  );
}
