"use client";

function Select({ options, value, onChange, type = "default", ...props }) {
  // Determine the border color based on the type prop
  const borderColor = type === "white" ? "border-grey-100" : "border-grey-300";

  return (
    <select
      value={value}
      onChange={onChange}
      className={`border p-3 text-lg ${borderColor} bg-grey-0 rounded-sm font-medium shadow-sm`}
      {...props}
    >
      {options.map(option => (
        <option value={option.modelId} key={option.modelId}>
          {option.modelName}
        </option>
      ))}
    </select>
  );
}

export default Select;
