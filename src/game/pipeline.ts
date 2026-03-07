export interface PipelineStage {
  key: string
  label: string
  desc: string
  color: string
}

export const PIPELINE_STAGES: PipelineStage[] = [
  { key: 'decode',  label: 'Decoding',         desc: 'Convincing the browser this is an image',          color: 'hsl(0,85%,68%)' },
  { key: 'palette', label: 'Analyzing colors',  desc: 'Arguing over which colors matter most',            color: 'hsl(30,90%,65%)' },
  { key: 'assign',  label: 'Mapping colors',    desc: "Telling every pixel which team it's on",           color: 'hsl(55,90%,62%)' },
  { key: 'trace',   label: 'Tracing regions',   desc: 'Following the lines like a responsible adult',     color: 'hsl(120,65%,60%)' },
  { key: 'merge',   label: 'Simplifying',       desc: 'Bullying tiny regions into their neighbors',       color: 'hsl(180,65%,58%)' },
  { key: 'measure', label: 'Measuring',         desc: 'Figuring out where to put the numbers',            color: 'hsl(220,80%,72%)' },
  { key: 'finish',  label: 'Finishing',         desc: 'Tidying up, storing the puzzle, acting casual',    color: 'hsl(280,65%,72%)' },
]
