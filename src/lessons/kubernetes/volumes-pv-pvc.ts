import { AT_60, PROVISIONING, RECLAIM, REPLICAS, VOLUME, volumesPvPvcCode, volumesPvPvcSteps } from '../../kubernetes/scenarios/volumes-pv-pvc';
import type { LessonContent } from '../../types/lesson';

const pvc = { volume: 'PVC', provisioning: 'static PV', reclaim: 'Retain', replicas: '1', at60: 'nothing' };

// The pod has just been deleted: its records are on pv-1, not in the pod.
const steps = volumesPvPvcSteps(pvc);
const deleted = steps.find((s) => s.title.includes('deletes pod'))!;

const content: LessonContent = {
  overview:
    'A container\'s files vanish when it is replaced. Databases and anything else that must keep data need storage that outlives pods. Kubernetes splits that into two objects: a PersistentVolumeClaim (what an app asks for) and a PersistentVolume (a real disk). This lesson writes data, replaces the pod and watches what survives.',
  concept: [
    'An emptyDir volume lives inside the pod. It is handy for scratch space, and it is deleted with the pod.',
    'A PersistentVolumeClaim (PVC) asks for storage: a size and an access mode. The PV controller binds it to the smallest free PersistentVolume (PV) that fits. Pods mount the claim, not the disk.',
    'With a StorageClass, no PV has to exist in advance: the class\'s provisioner creates one for the claim (a cloud disk, for example). Without a fit and without a class, the claim stays Pending, and so does every pod that uses it.',
    'ReadWriteOnce (RWO) means one node at a time. A second pod on another node waits with a Multi-Attach error until the first lets go.',
    'When a claim is deleted, the PV\'s reclaimPolicy decides: Delete removes the disk and its data; Retain keeps it as Released for someone to recover. A claim still used by a pod is only marked for deletion until the pod is gone.',
  ],
  howItWorks: [
    'Deployment db runs 1 pod that writes 1 record per second to its volume (shown as 5 records every 5 s).',
    'At 40 s its pod is deleted, and the ReplicaSet starts a new one. With a PVC, the new pod mounts the same volume and carries on from where the old one stopped. With an emptyDir, it starts from zero.',
    'Provisioning: a static 2Gi pv-1, a StorageClass that creates pvc-data on demand, or nothing at all.',
    'With the last setting on, db is scaled to 0 at 60 s and the claim deleted at 62 s, so the reclaimPolicy decides what happens to the data. With 2 replicas, the second pod lands on the other node and waits on the RWO volume.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'volume', label: 'Volume', type: 'choice', sample: pvc.volume, options: VOLUME },
      { name: 'provisioning', label: 'Provisioning', type: 'choice', sample: pvc.provisioning, options: PROVISIONING },
      { name: 'reclaim', label: 'reclaimPolicy', type: 'choice', sample: pvc.reclaim, options: RECLAIM },
      { name: 'replicas', label: 'Replicas', type: 'choice', sample: pvc.replicas, options: REPLICAS },
      { name: 'at60', label: 'At 60 s', type: 'choice', sample: pvc.at60, options: AT_60 },
    ],
    presets: [
      { label: 'emptyDir loses data', values: { ...pvc, volume: 'emptyDir' } },
      { label: 'A PVC keeps it', values: pvc },
      { label: 'No PV: everything Pending', values: { ...pvc, provisioning: 'none' } },
      { label: 'Dynamic provisioning', values: { ...pvc, provisioning: 'StorageClass', reclaim: 'Delete' } },
      { label: 'Delete the claim (Retain)', values: { ...pvc, at60: 'scale to 0, delete PVC' } },
      { label: 'Delete the claim (Delete)', values: { ...pvc, reclaim: 'Delete', at60: 'scale to 0, delete PVC' } },
      { label: 'Two replicas, one RWO volume', values: { ...pvc, replicas: '2' } },
    ],
    generate: volumesPvPvcSteps,
    codeLabel: 'Pseudocode',
  },
  code: volumesPvPvcCode,
  prosCons: {
    pros: ['Data outlives pods, restarts and rescheduling', 'Apps ask for storage without knowing the disk behind it', 'StorageClasses create disks on demand'],
    cons: ['ReadWriteOnce volumes tie a pod to one node at a time', 'reclaimPolicy Delete can destroy data with a single kubectl delete', 'Disks are slower to move than pods'],
    useWhen: ['Databases, queues and anything that must keep its data', 'Uploads or caches that are expensive to rebuild'],
    avoidWhen: ['Scratch data you can lose: use emptyDir', 'Several replicas writing one RWO volume: use a StatefulSet with a claim per pod'],
  },
  applications: [
    'A PostgreSQL pod with a 10Gi PVC from the cloud\'s default StorageClass',
    'kubectl get pvc,pv shows each claim, its volume and their status',
    'Setting reclaimPolicy Retain on volumes holding production data',
  ],
  commonMistakes: [
    'Keeping important data in an emptyDir or the container filesystem.',
    'Scaling a Deployment with one RWO claim to several replicas: pods on other nodes get Multi-Attach errors.',
    'Deleting a claim whose volume has reclaimPolicy Delete and losing the data.',
    'A claim with no StorageClass and no matching PV, leaving the app Pending.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The db pod writing to PVC data has just been deleted. What does its replacement find on the volume?',
      view: deleted.view,
      options: ['All the records the old pod wrote', 'An empty volume', 'Nothing: it can\'t start until the PVC is recreated', 'Half the records'],
      answer: 0,
      explanation: 'The data lives on pv-1, bound to the claim, not in the pod. The new pod mounts the same claim and carries on.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'A PVC names no StorageClass and no PersistentVolume fits it. What happens to the pod that uses it?',
      options: ['It stays Pending: pod has unbound immediate PersistentVolumeClaims', 'It starts without the volume, and mounts it later', 'It gets an emptyDir instead, until a volume appears', 'The scheduler creates a volume'],
      answer: 0,
      explanation: 'The scheduler won\'t place a pod whose claim isn\'t bound.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line decides what happens to the data when the claim is deleted?',
      code: "if (pv.reclaimPolicy === 'Delete') deleteVolume(pv)\nelse pv.phase = 'Released'",
      options: ["pv.reclaimPolicy === 'Delete'", 'bind(claim, pv)', 'attach(pv, node)', 'None: data is always kept'],
      answer: 0,
      explanation: 'Delete removes the disk with its data; Retain keeps it Released.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Two replicas share one ReadWriteOnce claim and land on different nodes. What does the second pod show?',
      options: ['A Multi-Attach error: the volume is already used on another node', 'It shares the volume fine, with both pods writing to it', 'OOMKilled', 'ImagePullBackOff, because the second node has no image'],
      answer: 0,
      explanation: 'RWO allows one node at a time. Use a StatefulSet (a claim per pod) or a ReadWriteMany volume.',
    },
  ],
  summary: [
    'emptyDir data dies with its pod; a PVC\'s data outlives it.',
    'A claim binds to the smallest fitting PV, or a StorageClass provisions one.',
    'ReadWriteOnce volumes attach to one node at a time.',
    'reclaimPolicy decides whether the data survives the claim.',
  ],
};

export default content;
