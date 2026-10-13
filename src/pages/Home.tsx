import { bubbleSortCode, bubbleSortSteps } from '../algorithms/sorting/bubble';
import { Visualizer } from '../components/visualization/Visualizer';

const steps = bubbleSortSteps([5, 3, 8, 1, 2]);

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <Visualizer steps={steps} code={bubbleSortCode} />
    </div>
  );
}
