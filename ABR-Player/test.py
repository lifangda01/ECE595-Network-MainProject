import subprocess
import sys
from random import random
from time import sleep

class Throttler(object):
	def __init__(self):
		super(Throttler, self).__init__()
		self.B_first = True
		self.D_first = True
		self.clear()
		self.init()

	def init(self):
		# sudo tc qdisc add dev lo root handle 1: htb default 12
		subprocess.call(['sudo','tc','qdisc','add','dev','lo','root','handle','1:','htb','default','12'])

	def setBandwidth(self, rate, ceil=0):
		# sudo tc class add dev lo parent 1:1 classid 1:12 htb rate 56kbps ceil 128kbps
		if self.B_first: 
			subprocess.call(['sudo','tc','class','add','dev','lo','parent','1:1','classid','1:12',
							'htb','rate',str(rate)+'kbps','ceil',str(ceil)+'kbps'])
			self.B_first = False
		else:
			subprocess.call(['sudo','tc','class','change','dev','lo','parent','1:1','classid','1:12',
							'htb','rate',str(rate)+'kbps','ceil',str(ceil)+'kbps'])	

	def setDelay(self, delay):
		# sudo tc qdisc add dev lo parent 1:12 netem delay 200ms
		if self.D_first:
			subprocess.call(['sudo','tc','qdisc','add','dev','lo','parent','1:12','netem','delay',str(delay)+'ms'])	
			self.D_first = False
		else:
			subprocess.call(['sudo','tc','qdisc','change','dev','lo','parent','1:12','netem','delay',str(delay)+'ms'])	

	def clear(self):
		# sudo tc qdisc del dev lo root
		subprocess.call(['sudo','tc','qdisc','del','dev','lo','root'])
		subprocess.call(['sudo','tc','class','del','dev','lo','root'])
		self.B_first = True
		self.D_first = True

	def show(self):
		# sudo tc -s qdisc ls dev lo
		subprocess.call(['sudo','tc','-s','qdisc','ls','dev','lo'])
		subprocess.call(['sudo','tc','-s','class','ls','dev','lo'])


# Gradient descent
def test_case_1():
	t = Throttler()
	for x in range(1,40):
		BW = x*100
		t.setBandwidth(BW)
		print "BW", BW, "time", (x-1)*10
		sleep(10)

# Gradient ascent (might as well only use gradient descent)
def test_case_2():
	t = Throttler()
	for x in range(10,1,-1):
		BW = x*100
		t.setBandwidth(BW)
		print "BW", BW, "time", (10-x)*10
		sleep(10)

# Toggling
def test_case_3():
	t = Throttler()
	BWs = [100, 1000]
	BW = BWs[0]
	for x in range(1,40):
		if BW == BWs[1]:
			BW = BWs[0]
		else:
			BW = BWs[1]
		t.setBandwidth(BW)
		print "BW", BW, "time", (x-1)*10
		sleep(30)

# Random
def test_case_4():
	t = Throttler()
	for x in range(1,40):
		BW = int(random()*500)
		t.setBandwidth(BW)
		print "BW", BW, "time", (x-1)*10
		sleep(10)


if __name__ == '__main__':
	tc = int(sys.argv[1])
	if tc == 1:
		print "=== test_case_1 ==="
		test_case_1()
	elif tc == 2:
		print "=== test_case_2 ==="
		test_case_2()		
	elif tc == 3:
		print "=== test_case_3 ==="
		test_case_3()	
	elif tc == 4:
		print "=== test_case_4 ==="
		test_case_4()
	else:
		print "No matching test case"
