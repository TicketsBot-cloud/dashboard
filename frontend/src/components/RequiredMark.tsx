// No margin: some labels are flex rows whose gap would stack with it.
const RequiredMark = () => (
  <span aria-hidden="true" title="Required to save" className="text-red-400 select-none">
    {" *"}
  </span>
);

export default RequiredMark;
