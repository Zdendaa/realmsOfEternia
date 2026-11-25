import { Euler, Quaternion, Vector3, type Matrix4 } from 'three';
import type { ModelInstance } from './ModelInstances';

const position = new Vector3();
const quaternion = new Quaternion();
const euler = new Euler();
const scale = new Vector3();
const stretch = new Vector3();

/** The world transform of one placement of a model (before the model's own part transforms). */
export function instanceMatrix(instance: ModelInstance, target: Matrix4): Matrix4 {
  position.set(instance.x, instance.y, instance.z);
  quaternion.setFromEuler(euler.set(0, instance.rotation, 0));
  scale.setScalar(instance.scale);
  if (instance.stretch) scale.multiply(stretch.copy(instance.stretch));
  target.compose(position, quaternion, scale);
  if (instance.local) target.multiply(instance.local);
  return target;
}
