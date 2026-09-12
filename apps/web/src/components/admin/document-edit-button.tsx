"use client";

export function DocumentEditButton() {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const editDetails = document.getElementById("edit-document") as HTMLDetailsElement | null;
    if (editDetails) {
      editDetails.open = true;
      editDetails.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <button className="avend-button avend-button--primary" onClick={handleClick}>
      Editar
    </button>
  );
}
