"use client";

export function DocumentEditCancelButton() {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const editDetails = document.getElementById("edit-document") as HTMLDetailsElement | null;
    if (editDetails) {
      editDetails.open = false;
    }
  };

  return (
    <button className="avend-button" onClick={handleClick} type="button">
      Cancelar
    </button>
  );
}
